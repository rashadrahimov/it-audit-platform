import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { finding, membership, user, vulnerability } from '../db/schema';
import { reportSnapshot } from '../db/schema';
import { MetricsService } from './metrics.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** T-V34: замороженный состав открытых findings/vulnerabilities на дату снапшота. */
interface SnapshotComposition {
  findings: Array<{
    id: string;
    title: unknown;
    riskRating: string;
    status: string;
    slaStatus: string;
    dueDate: string | null;
    owner: string | null;
  }>;
  vulnerabilities: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    slaStatus: string;
  }>;
}

type FindingDiffChange =
  'new' | 'remediated' | 'risk_escalated' | 'risk_reduced' | 'status_changed' | 'unchanged';

interface FindingDiffRow {
  id: string;
  title: unknown;
  riskRating: string;
  status: string;
  previousRiskRating: string | null;
  previousStatus: string | null;
  change: FindingDiffChange;
}

const RISK_SCORE: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function classifyFindingDiff(
  previous: SnapshotComposition['findings'][number] | undefined,
  current: SnapshotComposition['findings'][number] | undefined,
): FindingDiffChange {
  if (!previous && current) return 'new';
  if (previous && !current) return 'remediated';
  if (!previous || !current) return 'unchanged';

  const prevRisk = RISK_SCORE[previous.riskRating] ?? 0;
  const nextRisk = RISK_SCORE[current.riskRating] ?? 0;
  if (nextRisk > prevRisk) return 'risk_escalated';
  if (nextRisk < prevRisk) return 'risk_reduced';
  if (previous.status !== current.status) return 'status_changed';
  return 'unchanged';
}

/** Снапшоты метрик (T-073, B10): заморозка состояния на дату, доказуемость «как было». */
@Injectable()
export class SnapshotsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly metricsService: MetricsService,
  ) {}

  /** T-V34: снять состав открытых findings/vulnerabilities для заморозки. */
  private async captureComposition(tenantId: string): Promise<SnapshotComposition> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const findings = await tx
        .select({
          id: finding.id,
          title: finding.titleI18n,
          riskRating: finding.riskRating,
          status: finding.status,
          slaStatus: finding.slaStatus,
          dueDate: finding.dueDate,
          owner: user.fullName,
        })
        .from(finding)
        .leftJoin(membership, eq(finding.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(isNull(finding.deletedAt), ne(finding.status, 'closed')))
        .orderBy(desc(finding.createdAt));
      const vulns = await tx
        .select({
          id: vulnerability.id,
          title: vulnerability.title,
          severity: vulnerability.severity,
          status: vulnerability.status,
          slaStatus: vulnerability.slaStatus,
        })
        .from(vulnerability)
        .where(and(isNull(vulnerability.deletedAt), ne(vulnerability.status, 'resolved')))
        .orderBy(desc(vulnerability.createdAt));
      return {
        findings: findings.map((f) => ({
          ...f,
          dueDate: f.dueDate?.toISOString() ?? null,
        })),
        vulnerabilities: vulns,
      };
    });
  }

  async create(actor: Actor, label: string) {
    const metrics = await this.metricsService.computeAll(actor.tenantId);
    const composition = await this.captureComposition(actor.tenantId);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(reportSnapshot)
        .values({ tenantId: actor.tenantId, label, metrics, composition })
        .returning();
      if (!row) throw new Error('Снапшот не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'report_snapshot.created',
      entityType: 'report_snapshot',
      entityId: created.id,
      after: { label },
    });
    return { id: created.id, label: created.label, capturedAt: created.capturedAt };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: reportSnapshot.id,
          label: reportSnapshot.label,
          capturedAt: reportSnapshot.capturedAt,
        })
        .from(reportSnapshot)
        .orderBy(desc(reportSnapshot.capturedAt)),
    );
    return rows;
  }

  async get(tenantId: string, id: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(reportSnapshot)
        .where(and(eq(reportSnapshot.id, id))),
    );
    if (!row) throw new NotFoundException(`Снапшот ${id} не найден`);
    return {
      id: row.id,
      label: row.label,
      capturedAt: row.capturedAt,
      metrics: row.metrics,
      composition: row.composition,
    };
  }

  /** T-H39: follow-up/re-assessment diff — что изменилось с последнего snapshot до текущего момента. */
  async latestDiff(tenantId: string) {
    const [latest] = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(reportSnapshot).orderBy(desc(reportSnapshot.capturedAt)).limit(1),
    );
    if (!latest) {
      return {
        baseline: null,
        currentAt: new Date().toISOString(),
        counts: {
          baselineOpen: 0,
          currentOpen: 0,
          new: 0,
          remediated: 0,
          changed: 0,
          unchanged: 0,
        },
        findings: [],
      };
    }

    const previousComposition = latest.composition as Partial<SnapshotComposition>;
    const previousFindings = previousComposition.findings ?? [];
    const currentComposition = await this.captureComposition(tenantId);
    const currentFindings = currentComposition.findings;

    const previousById = new Map(previousFindings.map((f) => [f.id, f]));
    const currentById = new Map(currentFindings.map((f) => [f.id, f]));
    const ids = Array.from(new Set([...previousById.keys(), ...currentById.keys()]));

    const findings: FindingDiffRow[] = ids.map((id) => {
      const previous = previousById.get(id);
      const current = currentById.get(id);
      const change = classifyFindingDiff(previous, current);
      return {
        id,
        title: current?.title ?? previous?.title ?? '',
        riskRating: current?.riskRating ?? previous?.riskRating ?? 'low',
        status: current?.status ?? 'closed',
        previousRiskRating: previous?.riskRating ?? null,
        previousStatus: previous?.status ?? null,
        change,
      };
    });

    const changed = findings.filter(
      (f) =>
        f.change === 'risk_escalated' ||
        f.change === 'risk_reduced' ||
        f.change === 'status_changed',
    ).length;

    return {
      baseline: {
        id: latest.id,
        label: latest.label,
        capturedAt: latest.capturedAt,
      },
      currentAt: new Date().toISOString(),
      counts: {
        baselineOpen: previousFindings.length,
        currentOpen: currentFindings.length,
        new: findings.filter((f) => f.change === 'new').length,
        remediated: findings.filter((f) => f.change === 'remediated').length,
        changed,
        unchanged: findings.filter((f) => f.change === 'unchanged').length,
      },
      findings: findings
        .filter((f) => f.change !== 'unchanged')
        .sort((a, b) => {
          const order: Record<FindingDiffChange, number> = {
            risk_escalated: 1,
            new: 2,
            status_changed: 3,
            risk_reduced: 4,
            remediated: 5,
            unchanged: 6,
          };
          return order[a.change] - order[b.change];
        })
        .slice(0, 20),
    };
  }
}
