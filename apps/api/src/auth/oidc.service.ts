import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as oidc from 'openid-client';
import type { AuthTokenResponse } from '@it-audit/shared';
import { env } from '../env';
import { AuthService, type RequestMeta } from './auth.service';
import { SsoConfigService, type TenantOidcParams } from './sso-config.service';
import { SsoUserService } from './sso-user.service';

/** Режим завершения OIDC: 'api' — JSON (T-016), 'web' — cookie+redirect (T-H40). */
export type OidcMode = 'api' | 'web';

interface OidcStatePayload {
  purpose: 'oidc-state';
  /** id per-tenant sso_config; отсутствует → глобальный env-IdP (T-016). */
  ssoConfigId?: string;
  mode: OidcMode;
}

/** Параметры OIDC-клиента: тенантские (sso_config) или глобальные (env). */
type OidcParams = { issuerUrl: string; clientId: string; clientSecret: string };

/**
 * OIDC SSO (T-016, ADR-0006) + per-tenant (V49, T-H40, ADR-0021): клиент строится
 * из sso_config тенанта по домену/ssoConfigId, с fallback на глобальный env-IdP.
 * State (подписанный JWT) несёт ssoConfigId и mode; discovery кешируется по issuer.
 */
@Injectable()
export class OidcService {
  private readonly cache = new Map<string, oidc.Configuration>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly ssoUserService: SsoUserService,
    private readonly ssoConfigService: SsoConfigService,
  ) {}

  private envParams(): OidcParams {
    return {
      issuerUrl: env.oidcIssuerUrl,
      clientId: env.oidcClientId,
      clientSecret: env.oidcClientSecret,
    };
  }

  private async config(params: OidcParams): Promise<oidc.Configuration> {
    const key = `${params.issuerUrl}|${params.clientId}`;
    let cfg = this.cache.get(key);
    if (!cfg) {
      cfg = await oidc.discovery(
        new URL(params.issuerUrl),
        params.clientId,
        params.clientSecret,
        undefined,
        // http-issuer разрешаем только вне продакшна (локальный Keycloak)
        params.issuerUrl.startsWith('http://')
          ? { execute: [oidc.allowInsecureRequests] }
          : undefined,
      );
      this.cache.set(key, cfg);
    }
    return cfg;
  }

  /**
   * URL авторизации IdP. `tenant` задан → клиент тенанта (sso_config), иначе env.
   * mode кладётся в state — callback по нему решает JSON vs cookie+redirect.
   */
  async authorizationUrl(tenant: TenantOidcParams | null, mode: OidcMode): Promise<string> {
    const params = tenant ?? this.envParams();
    const config = await this.config(params);
    const state = await this.jwtService.signAsync(
      { purpose: 'oidc-state', ssoConfigId: tenant?.ssoConfigId, mode } satisfies OidcStatePayload,
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

  /** Обмен кода на токен. Клиент восстанавливается из ssoConfigId в state. */
  async handleCallback(
    currentUrl: URL,
    meta: RequestMeta,
  ): Promise<{ token: AuthTokenResponse; mode: OidcMode }> {
    const state = currentUrl.searchParams.get('state') ?? '';
    let payload: OidcStatePayload;
    try {
      payload = await this.jwtService.verifyAsync<OidcStatePayload>(state);
      if (payload.purpose !== 'oidc-state') throw new Error('не тот state');
    } catch {
      throw new UnauthorizedException('OIDC state невалиден или истёк');
    }

    const params = payload.ssoConfigId
      ? await this.ssoConfigService.oidcParamsById(payload.ssoConfigId)
      : this.envParams();
    if (!params) throw new UnauthorizedException('SSO-конфиг тенанта не найден');

    const config = await this.config(params);
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
    const token = await this.authService.issueTokenForUser(ssoUser.id, meta);
    return { token, mode: payload.mode ?? 'api' };
  }
}
