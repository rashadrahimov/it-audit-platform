import { Injectable } from '@nestjs/common';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { checklistItem, control, engagement, membership, response, subsidiary } from '../db/schema';

export interface OnboardingStep {
  key: string;
  done: boolean;
}

/**
 * Onboarding-checklist тенанта (T-046, мини-Roadmap): шаги ВЫЧИСЛЯЮТСЯ из данных
 * (как Vanta Roadmap) — без ручного стейта прогресс всегда честный.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly dbService: DbService) {}

  async steps(tenantId: string): Promise<{ steps: OnboardingStep[]; done: number; total: number }> {
    // membership над-тенантная — считается без RLS-контекста
    const [members] = await this.dbService.db
      .select({ n: count() })
      .from(membership)
      .where(and(eq(membership.tenantId, tenantId), eq(membership.status, 'active')));

    const domain = await this.dbService.withTenant(tenantId, async (tx) => {
      const [subs] = await tx
        .select({ n: count() })
        .from(subsidiary)
        .where(isNull(subsidiary.deletedAt));
      const [adapted] = await tx
        .select({ n: count() })
        .from(control)
        .where(and(isNotNull(control.tenantId), isNull(control.deletedAt)));
      const [engagements] = await tx
        .select({ n: count() })
        .from(engagement)
        .where(isNull(engagement.deletedAt));
      const [items] = await tx.select({ n: count() }).from(checklistItem);
      const [responses] = await tx.select({ n: count() }).from(response);
      return { subs, adapted, engagements, items, responses };
    });

    const steps: OnboardingStep[] = [
      { key: 'invite_team', done: (members?.n ?? 0) >= 2 },
      { key: 'create_subsidiary', done: (domain.subs?.n ?? 0) >= 1 },
      { key: 'adapt_control', done: (domain.adapted?.n ?? 0) >= 1 },
      { key: 'create_engagement', done: (domain.engagements?.n ?? 0) >= 1 },
      { key: 'build_checklist', done: (domain.items?.n ?? 0) >= 1 },
      { key: 'collect_responses', done: (domain.responses?.n ?? 0) >= 1 },
    ];
    return { steps, done: steps.filter((s) => s.done).length, total: steps.length };
  }
}
