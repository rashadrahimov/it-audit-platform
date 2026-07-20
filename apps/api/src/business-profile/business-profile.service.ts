import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { tenant } from '../db/schema';

/**
 * T-V36a: бизнес-профиль тенанта (Information) — юр.имя/юрисдикция/адрес/контакт
 * инцидентов. Хранится в tenant.settings.businessProfile (как sla/notifications).
 */
export interface BusinessProfile {
  legalName: string;
  jurisdiction: string;
  address: string;
  incidentContact: string;
  /** T-V58: контакт по безопасности (security.txt / vuln-disclosure). */
  securityContact: string;
  /** T-V36c: авто-логаут при простое, минуты (0 = выключено). */
  idleTimeoutMin: number;
  /** T-V36f: локаль тенанта по умолчанию — ставится в cookie при логине. */
  defaultLocale: Locale;
  /** T-V58: разрешить временный доступ поддержки платформы к аккаунту (audit-trail). */
  supportAccess: boolean;
  /** T-V60: организация требует MFA у всех участников (policy + видимость комплаенса). */
  requireMfa: boolean;
}

export const EMPTY_PROFILE: BusinessProfile = {
  legalName: '',
  jurisdiction: '',
  address: '',
  incidentContact: '',
  securityContact: '',
  idleTimeoutMin: 0,
  defaultLocale: DEFAULT_LOCALE,
  supportAccess: false,
  requireMfa: false,
};

type TextField = 'legalName' | 'jurisdiction' | 'address' | 'incidentContact' | 'securityContact';
const TEXT_FIELDS: TextField[] = [
  'legalName',
  'jurisdiction',
  'address',
  'incidentContact',
  'securityContact',
];

@Injectable()
export class BusinessProfileService {
  constructor(private readonly dbService: DbService) {}

  private extract(settings: unknown): BusinessProfile {
    const raw =
      typeof settings === 'object' && settings !== null
        ? ((settings as Record<string, unknown>).businessProfile as
            Partial<BusinessProfile> | undefined)
        : undefined;
    return { ...EMPTY_PROFILE, ...raw };
  }

  async get(tenantId: string): Promise<BusinessProfile> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    return this.extract(t?.settings);
  }

  async save(tenantId: string, input: Partial<BusinessProfile>): Promise<BusinessProfile> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    const settings = (t?.settings ?? {}) as Record<string, unknown>;
    const current = this.extract(settings);
    const merged: BusinessProfile = { ...current };
    for (const key of TEXT_FIELDS) {
      const v = input[key];
      if (typeof v === 'string') merged[key] = v.slice(0, 500);
    }
    if (typeof input.idleTimeoutMin === 'number' && Number.isFinite(input.idleTimeoutMin)) {
      merged.idleTimeoutMin = Math.min(1440, Math.max(0, Math.round(input.idleTimeoutMin)));
    }
    if (typeof input.supportAccess === 'boolean') merged.supportAccess = input.supportAccess;
    if (typeof input.requireMfa === 'boolean') merged.requireMfa = input.requireMfa;
    const locale = localeSchema.safeParse(input.defaultLocale);
    if (locale.success) merged.defaultLocale = locale.data;
    await this.dbService.db
      .update(tenant)
      .set({ settings: { ...settings, businessProfile: merged } })
      .where(eq(tenant.id, tenantId));
    return merged;
  }
}
