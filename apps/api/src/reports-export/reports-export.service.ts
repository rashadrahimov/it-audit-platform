import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import { resolveLocalized } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import {
  control,
  finding,
  membership,
  policy,
  reportSnapshot,
  risk,
  task,
  tenant,
  user,
} from '../db/schema';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../notifications/notification-dispatch.service';
import { JOB_WEEKLY_DIGEST, SYSTEM_QUEUE, WEEKLY_DIGEST_EVERY_MS } from '../jobs/jobs.constants';
import { diffMetrics, type MetricGroups } from './diff-metrics';
import { csvCell, xmlEscape } from './serialize';
import { computeGroupTrends } from './trend';

export const EXPORT_ENTITIES = ['findings', 'risks', 'controls'] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export const EXPORT_FORMATS = ['csv', 'xml'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function nextDigestRunAtForSettings(
  settings: NotificationSettings,
  now = new Date(),
): string | null {
  if (!settings.emailEnabled || settings.digest === 'off') return null;
  const next = new Date(now);
  next.setUTCHours(9, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  if (settings.digest === 'weekly') {
    while (next.getUTCDay() !== 1) next.setUTCDate(next.getUTCDate() + 1);
  } else if (settings.digest === 'monthly') {
    if (next.getUTCDate() !== 1) {
      next.setUTCMonth(next.getUTCMonth() + 1, 1);
      next.setUTCHours(9, 0, 0, 0);
    }
  }
  return next.toISOString();
}

@Injectable()
export class ReportsExportService {
  constructor(private readonly dbService: DbService) {}

  private notificationSettingsOf(row: { settings: unknown } | undefined): NotificationSettings {
    const raw =
      row && typeof row.settings === 'object' && row.settings !== null
        ? ((row.settings as Record<string, unknown>).notifications as
            Partial<NotificationSettings> | undefined)
        : undefined;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...raw };
  }

  async export(tenantId: string, entity: string, format: string) {
    if (!(EXPORT_ENTITIES as readonly string[]).includes(entity)) {
      throw new BadRequestException(`entity: ожидается ${EXPORT_ENTITIES.join('|')}`);
    }
    if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
      throw new BadRequestException(`format: ожидается ${EXPORT_FORMATS.join('|')}`);
    }
    const rows = await this.rows(tenantId, entity as ExportEntity);
    const body = format === 'csv' ? this.toCsv(rows) : this.toXml(entity, rows);
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/xml';
    return { body, contentType, filename: `${entity}.${format}` };
  }

  /** T-H41: scheduled report preview — read-only view of the compliance digest schedule. */
  async schedulePreview(tenantId: string) {
    const [tenantRow] = await this.dbService.db
      .select({ id: tenant.id, name: tenant.name, settings: tenant.settings })
      .from(tenant)
      .where(eq(tenant.id, tenantId));
    if (!tenantRow) throw new NotFoundException(`Тенант ${tenantId} не найден`);
    const settings = this.notificationSettingsOf(tenantRow);
    const now = new Date();

    const [metrics, recipients] = await Promise.all([
      this.dbService.withTenant(tenantId, async (tx) => {
        const [openF] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(finding)
          .where(and(isNull(finding.deletedAt), ne(finding.status, 'closed')));
        const [overdueF] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(finding)
          .where(
            and(
              isNull(finding.deletedAt),
              ne(finding.status, 'closed'),
              eq(finding.slaStatus, 'overdue'),
            ),
          );
        const [overdueT] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(task)
          .where(and(ne(task.status, 'done'), lt(task.dueDate, now)));
        const [policiesDue] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(policy)
          .where(
            and(isNull(policy.deletedAt), ne(policy.status, 'archived'), lt(policy.renewBy, now)),
          );
        return {
          openFindings: openF?.c ?? 0,
          overdueFindings: overdueF?.c ?? 0,
          overdueTasks: overdueT?.c ?? 0,
          policiesDue: policiesDue?.c ?? 0,
        };
      }),
      this.dbService.db
        .select({ email: user.email })
        .from(membership)
        .innerJoin(user, eq(membership.userId, user.id))
        .where(and(eq(membership.tenantId, tenantId), eq(membership.status, 'active'))),
    ]);

    const recipientCount = new Set(recipients.map((r) => r.email).filter(Boolean)).size;
    const hasSignal =
      metrics.openFindings > 0 || metrics.overdueTasks > 0 || metrics.policiesDue > 0;
    return {
      tenantName: tenantRow.name,
      enabled: settings.emailEnabled && settings.digest !== 'off',
      digest: settings.digest,
      schedule: settings.schedule,
      timezone: settings.timezone,
      nextRunAt: nextDigestRunAtForSettings(settings, now),
      recipientCount,
      willSendIfRunNow: settings.emailEnabled && settings.digest !== 'off' && hasSignal,
      metrics,
      deliveryProof: {
        queue: SYSTEM_QUEUE,
        jobName: JOB_WEEKLY_DIGEST,
        intervalMs: WEEKLY_DIGEST_EVERY_MS,
        emailTemplate: 'weekly-digest',
        manualTriggerPath: 'POST /jobs/weekly-digest',
        recipientPolicy: 'active tenant members with unique email addresses',
        signalGate: 'open findings, overdue tasks or policies due',
      },
    };
  }

  /** Сравнение двух снапшотов (T-099, REP-03): дельта по каждой метрике и breakdown-ключу. */
  async compare(tenantId: string, aId: string, bId: string) {
    const [a, b] = await this.dbService.withTenant(tenantId, async (tx) => {
      const [ra] = await tx
        .select()
        .from(reportSnapshot)
        .where(and(eq(reportSnapshot.id, aId)));
      const [rb] = await tx
        .select()
        .from(reportSnapshot)
        .where(and(eq(reportSnapshot.id, bId)));
      return [ra, rb];
    });
    if (!a) throw new NotFoundException(`Снапшот ${aId} не найден`);
    if (!b) throw new NotFoundException(`Снапшот ${bId} не найден`);
    const diff = diffMetrics(a.metrics as MetricGroups, b.metrics as MetricGroups);
    return { a: { id: a.id, label: a.label }, b: { id: b.id, label: b.label }, diff };
  }

  /**
   * Тренд метрик по всем снапшотам во времени (RSK-08, T-H13): для группы (по умолчанию
   * risks_by_class) — траектория каждого ключа (first/last/delta/direction).
   */
  async metricTrend(tenantId: string, group = 'risks_by_class') {
    const snaps = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ metrics: reportSnapshot.metrics, capturedAt: reportSnapshot.capturedAt })
        .from(reportSnapshot)
        .orderBy(asc(reportSnapshot.capturedAt)),
    );
    const rows = snaps.map(
      (s) => (s.metrics as MetricGroups)[group] ?? ({} as Record<string, number>),
    );
    return { group, snapshots: snaps.length, trends: computeGroupTrends(rows) };
  }

  private async rows(tenantId: string, entity: ExportEntity): Promise<Record<string, string>[]> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      if (entity === 'findings') {
        const rs = await tx
          .select({
            id: finding.id,
            titleI18n: finding.titleI18n,
            riskRating: finding.riskRating,
            status: finding.status,
          })
          .from(finding)
          .where(isNull(finding.deletedAt));
        return rs.map((r) => ({
          id: r.id,
          title: resolveLocalized(r.titleI18n, 'en'),
          severity: r.riskRating,
          status: r.status,
        }));
      }
      if (entity === 'risks') {
        const rs = await tx
          .select({
            id: risk.id,
            titleI18n: risk.titleI18n,
            riskClass: risk.riskClass,
            treatment: risk.treatment,
            status: risk.status,
          })
          .from(risk)
          .where(isNull(risk.deletedAt));
        return rs.map((r) => ({
          id: r.id,
          title: resolveLocalized(r.titleI18n, 'en'),
          riskClass: r.riskClass ?? '',
          treatment: r.treatment ?? '',
          status: r.status,
        }));
      }
      const rs = await tx
        .select({ id: control.id, ref: control.ref, objectiveI18n: control.objectiveI18n })
        .from(control)
        .where(isNull(control.deletedAt));
      return rs.map((r) => ({
        id: r.id,
        ref: r.ref,
        objective: resolveLocalized(r.objectiveI18n, 'en'),
      }));
    });
  }

  private toCsv(rows: Record<string, string>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]!);
    const lines = [headers.join(',')];
    for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(','));
    return lines.join('\n');
  }

  private toXml(entity: string, rows: Record<string, string>[]): string {
    const items = rows
      .map((r) => {
        const fields = Object.entries(r)
          .map(([k, v]) => `    <${k}>${xmlEscape(v)}</${k}>`)
          .join('\n');
        return `  <item>\n${fields}\n  </item>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${entity}>\n${items}\n</${entity}>`;
  }
}
