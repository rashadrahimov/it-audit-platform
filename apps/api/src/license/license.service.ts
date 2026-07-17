import { Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { license, membership, subsidiary } from '../db/schema';

export interface QuotaUsage {
  used: number;
  max: number | null;
  exceeded: boolean;
}

export interface LicenseUsage {
  plan: string | null;
  validUntil: string | null;
  subsidiaries: QuotaUsage;
  auditSeats: QuotaUsage;
}

/**
 * Лицензирование (T-026, ADR-0014). Потребление считается запросом; проверки
 * «мягкие»: превышение не блокирует операцию, а возвращает предупреждение.
 */
@Injectable()
export class LicenseService {
  constructor(private readonly dbService: DbService) {}

  async usage(tenantId: string): Promise<LicenseUsage> {
    const [lic] = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(license).where(eq(license.tenantId, tenantId)),
    );
    const [subs] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ value: count() })
        .from(subsidiary)
        .where(and(eq(subsidiary.tenantId, tenantId), isNull(subsidiary.deletedAt))),
    );
    // membership — над-тенантная, без RLS-контекста
    const [seats] = await this.dbService.db
      .select({ value: count() })
      .from(membership)
      .where(
        and(
          eq(membership.tenantId, tenantId),
          eq(membership.isAuditSeat, true),
          eq(membership.status, 'active'),
        ),
      );

    const quota = (used: number, max: number | null): QuotaUsage => ({
      used,
      max,
      exceeded: max !== null && used > max,
    });
    return {
      plan: lic?.plan ?? null,
      validUntil: lic?.validUntil?.toISOString() ?? null,
      subsidiaries: quota(subs?.value ?? 0, lic?.maxSubsidiaries ?? null),
      auditSeats: quota(seats?.value ?? 0, lic?.maxAuditSeats ?? null),
    };
  }

  /** Мягкая проверка ПОСЛЕ операции: список предупреждений (пустой = всё в квоте). */
  async quotaWarnings(tenantId: string): Promise<string[]> {
    const usage = await this.usage(tenantId);
    const warnings: string[] = [];
    if (usage.subsidiaries.exceeded) {
      warnings.push(
        `Квота дочерних компаний превышена: ${usage.subsidiaries.used} из ${usage.subsidiaries.max} по лицензии`,
      );
    }
    if (usage.auditSeats.exceeded) {
      warnings.push(
        `Квота audit-seats превышена: ${usage.auditSeats.used} из ${usage.auditSeats.max} по лицензии`,
      );
    }
    return warnings;
  }
}
