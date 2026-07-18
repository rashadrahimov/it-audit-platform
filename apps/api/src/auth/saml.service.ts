import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';
import type { AuthTokenResponse } from '@it-audit/shared';
import { env } from '../env';
import { AuthService, type RequestMeta } from './auth.service';
import { SsoUserService } from './sso-user.service';

/**
 * SAML SSO (T-024, ADR-0006): SP-initiated flow для on-prem клиентов (ADFS/AD).
 * Конфиг IdP — из его метадаты (entryPoint + cert подписи), как discovery у OIDC:
 * Keycloak генерирует ключ realm'а при импорте, пинить cert в env нельзя.
 * Валидация ответа: подписи Response и Assertion, audience, InResponseTo
 * (сверка с выданным AuthnRequest = CSRF- и replay-защита).
 * JIT-провижининг — SsoUserService.
 */
@Injectable()
export class SamlService {
  private saml?: SAML;

  constructor(
    private readonly authService: AuthService,
    private readonly ssoUserService: SsoUserService,
  ) {}

  private async instance(): Promise<SAML> {
    if (!this.saml) {
      const { entryPoint, idpCerts } = await this.fetchIdpMetadata();
      this.saml = new SAML({
        issuer: env.samlSpIssuer,
        callbackUrl: env.samlCallbackUrl,
        entryPoint,
        idpCert: idpCerts,
        identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        wantAuthnResponseSigned: true,
        wantAssertionsSigned: true,
        validateInResponseTo: ValidateInResponseTo.always,
        // ADFS спотыкается о RequestedAuthnContext — стандартно не отправлять
        disableRequestedAuthnContext: true,
      });
    }
    return this.saml;
  }

  /** Метадата IdP: Keycloak-descriptor и ADFS FederationMetadata.xml — один формат. */
  private async fetchIdpMetadata(): Promise<{ entryPoint: string; idpCerts: string[] }> {
    const response = await fetch(env.samlIdpMetadataUrl);
    if (!response.ok) throw new Error(`Метадата SAML IdP: HTTP ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/xml');
    // разбор по localName: префиксы namespace'ов у Keycloak и ADFS разные
    const descendants = (root: { getElementsByTagName(name: string): ArrayLike<XmlElement> }) =>
      Array.from(root.getElementsByTagName('*') as ArrayLike<XmlElement>);
    const idp = descendants(doc).find((el) => el.localName === 'IDPSSODescriptor');
    if (!idp) throw new Error('В метадате IdP нет IDPSSODescriptor');

    const idpCerts = descendants(idp)
      .filter((el) => el.localName === 'KeyDescriptor' && el.getAttribute('use') !== 'encryption')
      .flatMap((key) =>
        descendants(key)
          .filter((el) => el.localName === 'X509Certificate')
          .map((el) => (el.textContent ?? '').replace(/\s+/g, '')),
      )
      .filter(Boolean);
    if (idpCerts.length === 0) throw new Error('В метадате IdP нет cert подписи');

    const entryPoint = descendants(idp)
      .find(
        (el) =>
          el.localName === 'SingleSignOnService' &&
          el.getAttribute('Binding') === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
      )
      ?.getAttribute('Location');
    if (!entryPoint) throw new Error('В метадате IdP нет SSO-endpoint с redirect-binding');

    return { entryPoint, idpCerts };
  }

  async authorizationUrl(): Promise<string> {
    const saml = await this.instance();
    return saml.getAuthorizeUrlAsync('', undefined, {});
  }

  async handleCallback(
    body: Record<string, string>,
    meta: RequestMeta,
  ): Promise<AuthTokenResponse> {
    const saml = await this.instance();
    let profile;
    try {
      ({ profile } = await saml.validatePostResponseAsync(body));
    } catch {
      // битая подпись, чужой audience, повторный/просроченный ответ — не наша 500
      throw new UnauthorizedException('SAML-ответ не прошёл проверку');
    }
    if (!profile) throw new UnauthorizedException('SAML-ответ без утверждения о входе');

    const rawEmail = profile.nameID || profile['email'];
    const email = typeof rawEmail === 'string' && rawEmail ? rawEmail.toLowerCase() : null;
    if (!email) throw new UnauthorizedException('IdP не вернул email');

    const fullName =
      [profile['firstName'], profile['lastName']]
        .filter((part): part is string => typeof part === 'string' && part !== '')
        .join(' ') || undefined;

    const ssoUser = await this.ssoUserService.provisionUser(email, fullName);
    return this.authService.issueTokenForUser(ssoUser.id, meta);
  }
}
