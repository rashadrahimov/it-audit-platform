import { Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lte, notInArray, sql } from 'drizzle-orm';
import { localeSchema } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { finding, membership, tenant, user } from '../db/schema';
import { env } from '../env';

/**
 * Напоминания о дедлайне finding'а (T-039): за SLA_DUE_SOON_DAYS до due_date —
 * письмо обеим сторонам (owner + auditor). reminder_sent_at — дедуп: одно
 * напоминание на finding (суточная джоба не спамит).
 */
@Injectable()
export class FindingRemindersService {
  constructor(
    private readonly dbService: DbService,
    private readonly emailService: EmailService,
  ) {}

  async send(): Promise<{ sent: number }> {
    const tenants = await this.dbService.db.select({ id: tenant.id }).from(tenant);
    let sent = 0;
    const windowEnd = new Date(Date.now() + env.slaDueSoonDays * 24 * 60 * 60 * 1000);
    for (const t of tenants) {
      const due = await this.dbService.withTenant(t.id, (tx) =>
        tx
          .select()
          .from(finding)
          .where(
            and(
              isNull(finding.deletedAt),
              isNull(finding.reminderSentAt),
              notInArray(finding.status, ['closed']),
              gte(finding.dueDate, sql`now()`),
              lte(finding.dueDate, windowEnd),
            ),
          ),
      );
      for (const f of due) {
        const recipients = [];
        for (const membershipId of [f.ownerMembershipId, f.auditorMembershipId]) {
          if (!membershipId) continue;
          const [person] = await this.dbService.db
            .select({ email: user.email, locale: user.locale })
            .from(membership)
            .innerJoin(user, eq(membership.userId, user.id))
            .where(eq(membership.id, membershipId));
          if (person) recipients.push(person);
        }
        for (const person of recipients) {
          const parsedLocale = localeSchema.safeParse(person.locale);
          await this.emailService.sendTemplate(
            'finding-reminder',
            parsedLocale.success ? parsedLocale.data : 'en',
            person.email,
            {
              findingTitle: f.titleI18n.en,
              dueDate: f.dueDate?.toISOString().slice(0, 10) ?? '',
            },
          );
          sent += 1;
        }
        if (recipients.length > 0) {
          await this.dbService.withTenant(t.id, (tx) =>
            tx
              .update(finding)
              .set({ reminderSentAt: sql`now()` })
              .where(eq(finding.id, f.id)),
          );
        }
      }
    }
    return { sent };
  }
}
