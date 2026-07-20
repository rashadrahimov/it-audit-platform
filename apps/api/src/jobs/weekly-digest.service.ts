import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import { localeSchema } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
} from '../notifications/notification-dispatch.service';
import { finding, membership, policy, task, tenant, user } from '../db/schema';

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

  async send(now = new Date()): Promise<{ tenants: number; emails: number }> {
    const tenants = await this.dbService.db
      .select({ id: tenant.id, name: tenant.name, settings: tenant.settings })
      .from(tenant);
    let tenantsSent = 0;
    let emails = 0;
    for (const t of tenants) {
      const settings = this.settingsOf(t);
      if (!this.dueToday(settings, now)) continue;

      const counts = await this.dbService.withTenant(t.id, async (tx) => {
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
      });

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
        await this.emailService.sendTemplate(
          'weekly-digest',
          parsed.success ? parsed.data : 'en',
          r.email,
          {
            tenantName: t.name,
            openFindings: String(counts.openFindings),
            overdueFindings: String(counts.overdueFindings),
            overdueTasks: String(counts.overdueTasks),
            policiesDue: String(counts.policiesDue),
          },
        );
        emails += 1;
      }
      if (seen.size > 0) tenantsSent += 1;
    }
    return { tenants: tenantsSent, emails };
  }
}
