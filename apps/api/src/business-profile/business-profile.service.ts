import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
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
}

export const EMPTY_PROFILE: BusinessProfile = {
  legalName: '',
  jurisdiction: '',
  address: '',
  incidentContact: '',
};

const FIELDS: Array<keyof BusinessProfile> = [
  'legalName',
  'jurisdiction',
  'address',
  'incidentContact',
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
    for (const key of FIELDS) {
      const v = input[key];
      if (typeof v === 'string') merged[key] = v.slice(0, 500);
    }
    await this.dbService.db
      .update(tenant)
      .set({ settings: { ...settings, businessProfile: merged } })
      .where(eq(tenant.id, tenantId));
    return merged;
  }
}
