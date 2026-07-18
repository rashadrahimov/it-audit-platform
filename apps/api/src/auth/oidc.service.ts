import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as oidc from 'openid-client';
import type { AuthTokenResponse } from '@it-audit/shared';
import { env } from '../env';
import { AuthService, type RequestMeta } from './auth.service';
import { SsoUserService } from './sso-user.service';

interface OidcStatePayload {
  purpose: 'oidc-state';
}

/**
 * OIDC SSO (T-016, ADR-0006): authorization code flow с confidential-клиентом.
 * Работает с любым OIDC-провайдером (Entra ID/Google/Keycloak) через discovery;
 * state — подписанный JWT (CSRF-защита). JIT-провижининг — SsoUserService.
 */
@Injectable()
export class OidcService {
  private configuration?: oidc.Configuration;

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly ssoUserService: SsoUserService,
  ) {}

  private async config(): Promise<oidc.Configuration> {
    if (!this.configuration) {
      this.configuration = await oidc.discovery(
        new URL(env.oidcIssuerUrl),
        env.oidcClientId,
        env.oidcClientSecret,
        undefined,
        // http-issuer разрешаем только вне продакшна (локальный Keycloak)
        env.oidcIssuerUrl.startsWith('http://')
          ? { execute: [oidc.allowInsecureRequests] }
          : undefined,
      );
    }
    return this.configuration;
  }

  async authorizationUrl(): Promise<string> {
    const config = await this.config();
    const state = await this.jwtService.signAsync(
      { purpose: 'oidc-state' } satisfies OidcStatePayload,
      { expiresIn: 600 },
    );
    return oidc
      .buildAuthorizationUrl(config, {
        redirect_uri: env.oidcRedirectUrl,
        scope: 'openid profile email',
        state,
      })
      .toString();
  }

  async handleCallback(currentUrl: URL, meta: RequestMeta): Promise<AuthTokenResponse> {
    const state = currentUrl.searchParams.get('state') ?? '';
    try {
      const payload = await this.jwtService.verifyAsync<OidcStatePayload>(state);
      if (payload.purpose !== 'oidc-state') throw new Error('не тот state');
    } catch {
      throw new UnauthorizedException('OIDC state невалиден или истёк');
    }

    const config = await this.config();
    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, currentUrl, { expectedState: state });
    } catch {
      // невалидный/повторно использованный код — не наша 500-ошибка
      throw new UnauthorizedException('Обмен кода у IdP не удался');
    }
    const claims = tokens.claims();
    const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : null;
    if (!email) throw new UnauthorizedException('IdP не вернул email');

    const ssoUser = await this.ssoUserService.provisionUser(email, claims?.name);
    return this.authService.issueTokenForUser(ssoUser.id, meta);
  }
}
