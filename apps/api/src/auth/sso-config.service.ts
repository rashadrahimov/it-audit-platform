import { ConflictException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type {
  SsoConfigResponse,
  SsoConfigUpsert,
  SsoDispatchResponse,
  SsoMethod,
} from '@it-audit/shared';
import { decryptConfig, encryptConfig } from '../connectors/config-crypto';
import { DbService } from '../db/db.service';
import { ssoConfig } from '../db/schema';
import { emailDomain, resolveDispatch } from './sso-dispatch';

/** Параметры подключения OIDC-клиента тенанта (V49, T-H40) — секрет расшифрован. */
export interface TenantOidcParams {
  ssoConfigId: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Per-tenant SSO-конфиг (V49, ADR-0021): CRUD для админа тенанта + публичный
 * диспатч логина по домену e-mail. Таблица над-тенантная (без RLS) — изоляция
 * тенантов здесь, в коде: CRUD скоупится по tenantId из guard.
 */
@Injectable()
export class SsoConfigService {
  constructor(private readonly dbService: DbService) {}

  /** Home-realm discovery: по e-mail — решение «пароль или увести на IdP». Публично. */
  async dispatch(email: string): Promise<SsoDispatchResponse> {
    const domain = emailDomain(email);
    if (!domain) return { dispatch: 'password' };
    const [row] = await this.dbService.db
      .select()
      .from(ssoConfig)
      .where(eq(ssoConfig.emailDomain, domain));
    return resolveDispatch(
      row
        ? {
            method: row.method as SsoMethod,
            providerLabel: row.providerLabel,
            enabled: row.enabled,
          }
        : null,
    );
  }

  /** OIDC-параметры тенанта по домену (для init логина). null — если не OIDC/выключен. */
  async oidcParamsByDomain(domain: string): Promise<TenantOidcParams | null> {
    const [row] = await this.dbService.db
      .select()
      .from(ssoConfig)
      .where(eq(ssoConfig.emailDomain, domain.toLowerCase()));
    return this.toOidcParams(row);
  }

  /** OIDC-параметры тенанта по id конфига (для callback — id берётся из state). */
  async oidcParamsById(id: string): Promise<TenantOidcParams | null> {
    const [row] = await this.dbService.db.select().from(ssoConfig).where(eq(ssoConfig.id, id));
    return this.toOidcParams(row);
  }

  private toOidcParams(row?: typeof ssoConfig.$inferSelect): TenantOidcParams | null {
    if (!row || !row.enabled || row.method !== 'oidc' || !row.issuerUrl || !row.clientId) {
      return null;
    }
    const secret = row.secretEncrypted
      ? String(decryptConfig(row.secretEncrypted).secret ?? '')
      : '';
    return {
      ssoConfigId: row.id,
      issuerUrl: row.issuerUrl,
      clientId: row.clientId,
      clientSecret: secret,
    };
  }

  async list(tenantId: string): Promise<SsoConfigResponse[]> {
    const rows = await this.dbService.db
      .select()
      .from(ssoConfig)
      .where(eq(ssoConfig.tenantId, tenantId));
    return rows.map((r) => this.toView(r));
  }

  async upsert(tenantId: string, input: SsoConfigUpsert): Promise<SsoConfigResponse> {
    const domain = input.emailDomain.toLowerCase();
    const [existing] = await this.dbService.db
      .select()
      .from(ssoConfig)
      .where(eq(ssoConfig.emailDomain, domain));
    // Домен уникален глобально — чужой тенант его не перехватывает
    if (existing && existing.tenantId !== tenantId) {
      throw new ConflictException('Домен уже закреплён за другим тенантом');
    }

    const base = {
      method: input.method,
      providerLabel: input.providerLabel,
      issuerUrl: input.issuerUrl ?? null,
      clientId: input.clientId ?? null,
      metadataUrl: input.metadataUrl ?? null,
      enabled: input.enabled ?? true,
    };
    // Секрет перезаписываем только если пришёл (пустой апдейт не стирает существующий)
    const secretPatch =
      input.clientSecret !== undefined
        ? { secretEncrypted: encryptConfig({ secret: input.clientSecret }) }
        : {};

    if (existing) {
      await this.dbService.db
        .update(ssoConfig)
        .set({ ...base, ...secretPatch })
        .where(eq(ssoConfig.id, existing.id));
    } else {
      await this.dbService.db
        .insert(ssoConfig)
        .values({ tenantId, emailDomain: domain, ...base, ...secretPatch });
    }

    const [saved] = await this.dbService.db
      .select()
      .from(ssoConfig)
      .where(eq(ssoConfig.emailDomain, domain));
    return this.toView(saved!);
  }

  async remove(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const deleted = await this.dbService.db
      .delete(ssoConfig)
      .where(and(eq(ssoConfig.id, id), eq(ssoConfig.tenantId, tenantId)))
      .returning();
    return { deleted: deleted.length > 0 };
  }

  private toView(r: typeof ssoConfig.$inferSelect): SsoConfigResponse {
    return {
      id: r.id,
      emailDomain: r.emailDomain,
      method: r.method as SsoMethod,
      providerLabel: r.providerLabel,
      issuerUrl: r.issuerUrl,
      clientId: r.clientId,
      metadataUrl: r.metadataUrl,
      hasSecret: r.secretEncrypted !== null,
      enabled: r.enabled,
    };
  }
}
