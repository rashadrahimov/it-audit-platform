import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { tenant } from '../db/schema';
import { env } from '../env';

/**
 * T-V32: per-tenant SLA-окна ремедиации по severity (дни до due) + окно due_soon.
 * Хранится в tenant.settings.sla (как notifications). Дефолты — индустриальные.
 */
export interface SlaWindows {
  critical: number;
  high: number;
  medium: number;
  low: number;
  /** За сколько дней до due помечать due_soon. */
  dueSoonDays: number;
}

export const DEFAULT_SLA_WINDOWS: SlaWindows = {
  critical: 7,
  high: 30,
  medium: 90,
  low: 180,
  dueSoonDays: env.slaDueSoonDays,
};

const SEVERITIES: Array<keyof SlaWindows> = ['critical', 'high', 'medium', 'low', 'dueSoonDays'];

/** Окно (в днях) для severity; неизвестная severity → medium. */
export function windowForSeverity(windows: SlaWindows, severity: string): number {
  if (severity === 'critical' || severity === 'high' || severity === 'low')
    return windows[severity];
  return windows.medium;
}

/** Авто-дедлайн по severity: from + окно (в днях). Чистая функция. */
export function dueDateFor(windows: SlaWindows, severity: string, from = new Date()): Date {
  const days = windowForSeverity(windows, severity);
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class SlaConfigService {
  constructor(private readonly dbService: DbService) {}

  private extract(settings: unknown): SlaWindows {
    const raw =
      typeof settings === 'object' && settings !== null
        ? ((settings as Record<string, unknown>).sla as Partial<SlaWindows> | undefined)
        : undefined;
    return { ...DEFAULT_SLA_WINDOWS, ...raw };
  }

  async configOf(tenantId: string): Promise<SlaWindows> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    return this.extract(t?.settings);
  }

  async saveConfig(tenantId: string, input: Partial<SlaWindows>): Promise<SlaWindows> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    const settings = (t?.settings ?? {}) as Record<string, unknown>;
    const current = this.extract(settings);
    const merged: SlaWindows = { ...current };
    for (const key of SEVERITIES) {
      const v = input[key];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 3650) {
        merged[key] = Math.round(v);
      }
    }
    await this.dbService.db
      .update(tenant)
      .set({ settings: { ...settings, sla: merged } })
      .where(eq(tenant.id, tenantId));
    return merged;
  }
}
