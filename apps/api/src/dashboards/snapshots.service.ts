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
}
