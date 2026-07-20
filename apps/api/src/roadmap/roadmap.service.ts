import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import {
  control,
  controlMapping,
  finding,
  framework,
  frameworkActivation,
  frameworkRequirement,
  policy,
  test as testTable,
} from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** Канонические фазы внедрения (Vanta-подобный roadmap, T-V33). */
const PHASES = ['setup', 'policies', 'remediation', 'audit'] as const;

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/**
 * T-V33: roadmap внедрения per-framework — фазы с прогрессом от реальных данных
 * (coverage/policies/findings/tests), целевая дата audit-ready, on/off track.
 */
@Injectable()
export class RoadmapService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async roadmap(tenantId: string, locale: Locale) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      // активированные фреймворки тенанта
      const activations = await tx
        .select({
          activationId: frameworkActivation.id,
          frameworkId: frameworkActivation.frameworkId,
          targetDate: frameworkActivation.targetDate,
          createdAt: frameworkActivation.createdAt,
          nameI18n: framework.nameI18n,
        })
        .from(frameworkActivation)
        .innerJoin(framework, eq(frameworkActivation.frameworkId, framework.id))
        .where(eq(frameworkActivation.tenantId, tenantId));

      // org-maturity метрики (общие для тенанта): политики, findings, тесты
      const [polAll] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(policy)
        .where(isNull(policy.deletedAt));
      const [polDone] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(policy)
        .where(and(isNull(policy.deletedAt), eq(policy.status, 'approved')));
      const [findAll] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(finding)
        .where(isNull(finding.deletedAt));
      const [findClosed] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(finding)
        .where(and(isNull(finding.deletedAt), eq(finding.status, 'closed')));
      const [testAll] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(testTable)
        .where(and(isNull(testTable.deletedAt), ne(testTable.status, 'deactivated')));
      const [testOk] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(testTable)
        .where(and(isNull(testTable.deletedAt), eq(testTable.status, 'ok')));

      const policiesPct = pct(polDone?.c ?? 0, polAll?.c ?? 0);
      const remediationPct = pct(findClosed?.c ?? 0, findAll?.c ?? 0);
      const testsPct = pct(testOk?.c ?? 0, testAll?.c ?? 0);

      const now = Date.now();
      const items = [];
      for (const a of activations) {
        // coverage per-framework: % требований с хотя бы одним замапленным контролем тенанта
        const reqs = await tx
          .select({ ref: frameworkRequirement.ref, mappingId: controlMapping.id })
          .from(frameworkRequirement)
          .leftJoin(controlMapping, eq(controlMapping.requirementId, frameworkRequirement.id))
          .leftJoin(control, eq(controlMapping.controlId, control.id))
          .where(eq(frameworkRequirement.frameworkId, a.frameworkId));
        const allRefs = new Set<string>();
        const covered = new Set<string>();
        for (const r of reqs) {
          allRefs.add(r.ref);
          if (r.mappingId) covered.add(r.ref);
        }
        const setupPct = pct(covered.size, allRefs.size);

        const phases = [
          { key: 'setup', progress: setupPct },
          { key: 'policies', progress: policiesPct },
          { key: 'remediation', progress: remediationPct },
          { key: 'audit', progress: testsPct },
        ];
        const overall = Math.round(phases.reduce((s, p) => s + p.progress, 0) / phases.length);

        // on/off track: доля времени до цели vs прогресс
        let onTrack: boolean | null = null;
        let elapsedPct: number | null = null;
        if (a.targetDate) {
          const start = a.createdAt.getTime();
          const end = a.targetDate.getTime();
          if (end > start) {
            elapsedPct = Math.min(
              100,
              Math.max(0, Math.round(((now - start) / (end - start)) * 100)),
            );
            onTrack = overall >= elapsedPct;
          }
        }

        items.push({
          activationId: a.activationId,
          frameworkId: a.frameworkId,
          name: resolveLocalized(a.nameI18n, locale),
          phases,
          overall,
          auditReady: overall >= 100,
          targetDate: a.targetDate?.toISOString() ?? null,
          elapsedPct,
          onTrack,
        });
      }
      return { phaseOrder: PHASES, items };
    });
  }

  async setTarget(actor: Actor, activationId: string, targetDate: string | null) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(frameworkActivation)
        .where(
          and(
            eq(frameworkActivation.id, activationId),
            eq(frameworkActivation.tenantId, actor.tenantId),
          ),
        );
      if (!row) throw new NotFoundException(`Активация ${activationId} не найдена`);
      const parsed = targetDate ? new Date(targetDate) : null;
      if (targetDate && Number.isNaN(parsed!.getTime())) {
        throw new BadRequestException('targetDate: некорректная дата');
      }
      const [res] = await tx
        .update(frameworkActivation)
        .set({ targetDate: parsed })
        .where(eq(frameworkActivation.id, activationId))
        .returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'roadmap.target_set',
      entityType: 'framework_activation',
      entityId: activationId,
      after: { targetDate },
    });
    return { activationId: updated.id, targetDate: updated.targetDate?.toISOString() ?? null };
  }
}
