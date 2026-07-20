import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { tenant } from '../db/schema';
import { decryptConfig, encryptConfig } from '../connectors/config-crypto';

/**
 * T-V49: per-tenant SSO-конфиг. Хранится в tenant.settings.sso (как sla/notifications/
 * businessProfile). clientSecret шифруется (AES-256-GCM, connectors/config-crypto) и
 * наружу НЕ отдаётся. Управление конфигом; фактическая маршрутизация логина на IdP
 * тенанта (multi-IdP dispatch) — отдельный auth-форк, вне этого среза.
 */
export type SsoProtocol = 'oidc' | 'saml';

/** То, что хранится в settings.sso (secret — в зашифрованном виде). */
interface StoredSso {
  enabled: boolean;
  protocol: SsoProtocol;
  emailDomain: string;
  /** OIDC issuer или SAML entryPoint/metadata URL. */
  entryPoint: string;
  clientId: string;
  clientSecretEncrypted: string | null;
}

/** Наружная форма — без секрета, только флаг наличия. */
export interface SsoConfigView {
  enabled: boolean;
  protocol: SsoProtocol;
  emailDomain: string;
  entryPoint: string;
  clientId: string;
  hasSecret: boolean;
}

export interface SetSsoConfig {
  enabled?: boolean;
  protocol?: SsoProtocol;
  emailDomain?: string;
  entryPoint?: string;
  clientId?: string;
  /** Пустая строка/отсутствие → секрет сохраняется как есть. */
  clientSecret?: string;
}

const EMPTY: StoredSso = {
  enabled: false,
  protocol: 'oidc',
  emailDomain: '',
  entryPoint: '',
  clientId: '',
  clientSecretEncrypted: null,
};

/** T-V49-dispatch: домен из email (нижний регистр) или '' если не распознан. Чистая. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return '';
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

export interface SsoDiscovery {
  available: boolean;
  protocol?: SsoProtocol;
  tenantSlug?: string;
}

@Injectable()
export class SsoConfigService {
  constructor(private readonly dbService: DbService) {}

  private extract(settings: unknown): StoredSso {
    const raw =
      typeof settings === 'object' && settings !== null
        ? ((settings as Record<string, unknown>).sso as Partial<StoredSso> | undefined)
        : undefined;
    return { ...EMPTY, ...raw };
  }

  private toView(s: StoredSso): SsoConfigView {
    return {
      enabled: s.enabled,
      protocol: s.protocol,
      emailDomain: s.emailDomain,
      entryPoint: s.entryPoint,
      clientId: s.clientId,
      hasSecret: Boolean(s.clientSecretEncrypted),
    };
  }

  async get(tenantId: string): Promise<SsoConfigView> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    return this.toView(this.extract(t?.settings));
  }

  /**
   * T-V49-dispatch (ADR-0023): по email-домену найти тенант с включённым SSO.
   * Публичный (pre-login) — раскрывает лишь факт «домен использует SSO» + куда слать.
   */
  async discoverByEmail(email: string): Promise<SsoDiscovery> {
    const domain = emailDomain(email);
    if (!domain) return { available: false };
    const tenants = await this.dbService.db
      .select({ slug: tenant.slug, settings: tenant.settings })
      .from(tenant);
    for (const t of tenants) {
      const sso = this.extract(t.settings);
      if (sso.enabled && sso.emailDomain.toLowerCase() === domain) {
        return { available: true, protocol: sso.protocol, tenantSlug: t.slug };
      }
    }
    return { available: false };
  }

  async save(tenantId: string, input: SetSsoConfig): Promise<SsoConfigView> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    const settings = (t?.settings ?? {}) as Record<string, unknown>;
    const current = this.extract(settings);
    const merged: StoredSso = { ...current };
    if (typeof input.enabled === 'boolean') merged.enabled = input.enabled;
    if (input.protocol === 'oidc' || input.protocol === 'saml') merged.protocol = input.protocol;
    if (typeof input.emailDomain === 'string')
      merged.emailDomain = input.emailDomain.trim().slice(0, 253);
    if (typeof input.entryPoint === 'string')
      merged.entryPoint = input.entryPoint.trim().slice(0, 1000);
    if (typeof input.clientId === 'string') merged.clientId = input.clientId.trim().slice(0, 500);
    // пустой секрет → сохранить существующий (как в AI-конфиге)
    if (typeof input.clientSecret === 'string' && input.clientSecret.trim() !== '') {
      merged.clientSecretEncrypted = encryptConfig({ secret: input.clientSecret.trim() });
    }
    await this.dbService.db
      .update(tenant)
      .set({ settings: { ...settings, sso: merged } })
      .where(eq(tenant.id, tenantId));
    return this.toView(merged);
  }

  /**
   * Расшифрованный секрет (для будущей маршрутизации логина). Наружу не выводится —
   * только для внутреннего использования auth-слоем.
   */
  async resolveSecret(tenantId: string): Promise<string | null> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    const stored = this.extract(t?.settings);
    if (!stored.clientSecretEncrypted) return null;
    try {
      return String(
        (decryptConfig(stored.clientSecretEncrypted) as { secret?: string }).secret ?? '',
      );
    } catch {
      return null;
    }
  }
}
