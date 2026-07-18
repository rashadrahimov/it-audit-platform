/**
 * Конфигурация из env. Дефолты совпадают с docker-compose.yml и .env.example —
 * локальная разработка работает без .env.
 */
export const env = {
  /** Рантайм приложения: непривилегированная роль app — иначе RLS не действует (T-011). */
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5433/audit',
  /** Миграции/DDL: владелец схемы. */
  databaseUrlOwner: process.env.DATABASE_URL_OWNER ?? 'postgres://audit:audit@localhost:5433/audit',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  s3AccessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  s3SecretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
  s3Bucket: process.env.S3_BUCKET ?? 'audit-files',
  smtpHost: process.env.SMTP_HOST ?? 'localhost',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  smtpFrom: process.env.SMTP_FROM ?? 'IT Audit Platform <no-reply@it-audit.localhost>',
  /** Дев-дефолт. В любом развёртывании обязателен свой JWT_SECRET. */
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-jwt-secret-change-me',
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 1800),
  /** T-017: 0 отключает авто-деактивацию. */
  inactivityDeactivationDays: Number(process.env.INACTIVITY_DEACTIVATION_DAYS ?? 90),
  /** База ссылок в письмах (веб-приложение). */
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  /** OIDC SSO (T-016). Дефолты — локальный Keycloak из docker-compose (realm it-audit). */
  oidcIssuerUrl: process.env.OIDC_ISSUER_URL ?? 'http://localhost:8081/realms/it-audit',
  oidcClientId: process.env.OIDC_CLIENT_ID ?? 'it-audit-app',
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET ?? 'it-audit-dev-secret',
  oidcRedirectUrl: process.env.OIDC_REDIRECT_URL ?? 'http://localhost:3001/auth/oidc/callback',
  /**
   * SAML SSO (T-024). Метадата IdP вместо ручного конфига: cert подписи Keycloak
   * генерирует при импорте realm'а. У ADFS — /FederationMetadata/2007-06/FederationMetadata.xml.
   */
  samlIdpMetadataUrl:
    process.env.SAML_IDP_METADATA_URL ??
    'http://localhost:8081/realms/it-audit/protocol/saml/descriptor',
  /** EntityID нашего SP = clientId SAML-клиента в Keycloak / identifier в ADFS. */
  samlSpIssuer: process.env.SAML_SP_ISSUER ?? 'it-audit-saml',
  samlCallbackUrl: process.env.SAML_CALLBACK_URL ?? 'http://localhost:3001/auth/saml/callback',
  /**
   * LDAP-федерация (T-025): search+bind сервисным аккаунтом — AD-совместимый
   * паттерн. Дефолты — тестовый openldap из docker-compose. Для AD:
   * LDAP_SEARCH_FILTER=(sAMAccountName={{username}}) и сервисный bind-аккаунт.
   */
  ldapUrl: process.env.LDAP_URL ?? 'ldap://localhost:1389',
  ldapBindDn: process.env.LDAP_BIND_DN ?? 'cn=admin,dc=demo,dc=io',
  ldapBindPassword: process.env.LDAP_BIND_PASSWORD ?? 'admin',
  ldapSearchBase: process.env.LDAP_SEARCH_BASE ?? 'ou=people,dc=demo,dc=io',
  ldapSearchFilter: process.env.LDAP_SEARCH_FILTER ?? '(|(uid={{username}})(mail={{username}}))',
};
