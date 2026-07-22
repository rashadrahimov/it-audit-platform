import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { localeSchema, resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../notifications/notification-dispatch.service';
import {
  checklistItem,
  document,
  documentLink,
  engagement,
  finding,
  membership,
  policy,
  response,
  risk,
  task,
  tenant,
  user,
} from '../db/schema';
import { REPORT_DELIVERABLES, REPORT_PACKAGE_FORMATS } from '../reports/report-data.service';

export interface WeeklyDigestReportPackageSnapshot {
  engagementId: string;
  titleI18n: I18nText;
  readinessScore: number;
  ready: boolean;
  checklistTotal: number;
  answered: number;
  findings: number;
  openFindings: number;
  risks: number;
  evidenceLinks: number;
  totalFiles: number;
  formats: string[];
}

export function weeklyDigestReportPackageVars(
  snapshot: WeeklyDigestReportPackageSnapshot | null,
  locale: Locale,
): Record<string, string> {
  const status = (ready: boolean): string => {
    if (locale === 'ru') return ready ? 'готов' : 'сначала проверить';
    if (locale === 'az') return ready ? 'hazırdır' : 'əvvəlcə nəzərdən keçirin';
    return ready ? 'ready' : 'review first';
  };
  if (!snapshot) {
    return {
      reportPackageTitle: '—',
      reportPackageReadiness: '0',
      reportPackageStatus:
        locale === 'ru' ? 'не готов' : locale === 'az' ? 'hazır deyil' : 'not ready',
      reportPackageFiles: String(REPORT_DELIVERABLES.length * REPORT_PACKAGE_FORMATS.length),
      reportPackageFormats: REPORT_PACKAGE_FORMATS.map((format) => format.label).join(' / '),
      reportPackagePath: '/reports',
    };
  }
  return {
    reportPackageTitle: resolveLocalized(snapshot.titleI18n, locale),
    reportPackageReadiness: String(snapshot.readinessScore),
    reportPackageStatus: status(snapshot.ready),
    reportPackageFiles: String(snapshot.totalFiles),
    reportPackageFormats: snapshot.formats.join(' / '),
    reportPackagePath: `/engagements/${snapshot.engagementId}/report/package?locale=${locale}`,
  };
}

/**
 * T-V20: еженедельный дайджест комплаенса. Прогон раз в сутки; per-tenant
 * setting digest решает, слать ли сегодня (weekly=понедельник, daily=каждый
 * день, off=никогда). Получатели — активные участники с email (дедуп).
 */
@Injectable()
export class WeeklyDigestService {
  constructor(
    private readonly dbService: DbService,
    private readonly emailService: EmailService,
  ) {}

  private settingsOf(t: { settings: unknown }): NotificationSettings {
    const raw =
      typeof t.settings === 'object' && t.settings !== null
        ? ((t.settings as Record<string, unknown>).notifications as
            Partial<NotificationSettings> | undefined)
        : undefined;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...raw };
  }

  /** Слать ли дайджест сегодня по настройке (weekly → только понедельник). */
  private dueToday(settings: NotificationSettings, now: Date): boolean {
    if (!settings.emailEnabled || settings.digest === 'off') return false;
    if (settings.digest === 'daily') return true;
    return now.getUTCDay() === 1; // понедельник
  }

  /**
   * T-H85: scheduled digest includes the standard report-package context, not only counters.
   * Read-only and deterministic: latest active engagement + export readiness signals.
   */
  private async reportPackageSnapshot(
    tenantId: string,
  ): Promise<WeeklyDigestReportPackageSnapshot | null> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [eng] = await tx
        .select({
          id: engagement.id,
          titleI18n: engagement.titleI18n,
          auditTypeId: engagement.auditTypeId,
          subsidiaryId: engagement.subsidiaryId,
          periodStart: engagement.periodStart,
          periodEnd: engagement.periodEnd,
        })
        .from(engagement)
        .where(and(isNull(engagement.deletedAt), isNull(engagement.archivedAt)))
        .orderBy(desc(engagement.createdAt))
        .limit(1);
      if (!eng) return null;

      const items = await tx
        .select({ id: checklistItem.id })
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, eng.id));
      const itemIds = items.map((item) => item.id);
      const answers =
        itemIds.length > 0
          ? await tx
              .select({ id: response.id, checklistItemId: response.checklistItemId })
              .from(response)
              .where(inArray(response.checklistItemId, itemIds))
          : [];
      const findingRows = await tx
        .select({ id: finding.id, status: finding.status })
        .from(finding)
        .where(and(eq(finding.engagementId, eng.id), isNull(finding.deletedAt)));
      const riskRows = await tx.select({ id: risk.id }).from(risk).where(isNull(risk.deletedAt));

      const evidenceTargets = [eng.id, ...itemIds, ...answers.map((answer) => answer.id)];
      const evidenceRows =
        evidenceTargets.length > 0
          ? await tx
              .select({ documentId: document.id })
              .from(documentLink)
              .innerJoin(document, eq(documentLink.documentId, document.id))
              .where(
                and(inArray(documentLink.entityId, evidenceTargets), isNull(document.deletedAt)),
              )
          : [];

      const checklistTotal = items.length;
      const answered = new Set(answers.map((answer) => answer.checklistItemId)).size;
      const evidenceLinks = new Set(evidenceRows.map((row) => row.documentId)).size;
      const checks = [
        Boolean(eng.periodStart || eng.periodEnd || eng.auditTypeId || eng.subsidiaryId),
        checklistTotal > 0,
        checklistTotal > 0 && answered >= checklistTotal,
        findingRows.length > 0,
        riskRows.length > 0,
        evidenceLinks > 0,
      ];
      const readinessScore = Math.round((checks.filter(Boolean).length / checks.length) * 100);

      return {
        engagementId: eng.id,
        titleI18n: eng.titleI18n,
        readinessScore,
        ready: readinessScore >= 80 && checklistTotal > 0,
        checklistTotal,
        answered,
        findings: findingRows.length,
        openFindings: findingRows.filter((row) => row.status !== 'closed').length,
        risks: riskRows.length,
        evidenceLinks,
        totalFiles: REPORT_DELIVERABLES.length * REPORT_PACKAGE_FORMATS.length,
        formats: REPORT_PACKAGE_FORMATS.map((format) => format.label),
      };
    });
  }

  async send(now = new Date()): Promise<{ tenants: number; emails: number }> {
    const tenants = await this.dbService.db
      .select({ id: tenant.id, name: tenant.name, settings: tenant.settings })
      .from(tenant);
    let tenantsSent = 0;
    let emails = 0;
    for (const t of tenants) {
      const settings = this.settingsOf(t);
      if (!this.dueToday(settings, now)) continue;

      const [counts, reportPackage] = await Promise.all([
        this.dbService.withTenant(t.id, async (tx) => {
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
        this.reportPackageSnapshot(t.id),
      ]);

      // ничего примечательного — не спамим
      if (counts.openFindings === 0 && counts.overdueTasks === 0 && counts.policiesDue === 0) {
        continue;
      }

      const recipients = await this.dbService.db
        .select({ email: user.email, locale: user.locale })
        .from(membership)
        .innerJoin(user, eq(membership.userId, user.id))
        .where(and(eq(membership.tenantId, t.id), eq(membership.status, 'active')));
      const seen = new Set<string>();
      for (const r of recipients) {
        if (!r.email || seen.has(r.email)) continue;
        seen.add(r.email);
        const parsed = localeSchema.safeParse(r.locale);
        const locale = parsed.success ? parsed.data : 'en';
        await this.emailService.sendTemplate('weekly-digest', locale, r.email, {
          tenantName: t.name,
          openFindings: String(counts.openFindings),
          overdueFindings: String(counts.overdueFindings),
          overdueTasks: String(counts.overdueTasks),
          policiesDue: String(counts.policiesDue),
          ...weeklyDigestReportPackageVars(reportPackage, locale),
        });
        emails += 1;
      }
      if (seen.size > 0) tenantsSent += 1;
    }
    return { tenants: tenantsSent, emails };
  }
}
