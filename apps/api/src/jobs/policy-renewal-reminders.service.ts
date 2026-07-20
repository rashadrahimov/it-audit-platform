import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lte, ne, sql } from 'drizzle-orm';
import { localeSchema } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { membership, policy, tenant, user } from '../db/schema';
import { env } from '../env';

/**
 * T-V04: напоминание owner'у о продлении политики — renew_by в окне
 * SLA_DUE_SOON_DAYS (или уже просрочен). Дедуп renewal_reminder_sent_at —
 * одно письмо на срок (паттерн finding-reminders T-039).
 */
@Injectable()
export class PolicyRenewalRemindersService {
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
          .from(policy)
          .where(
            and(
              isNull(policy.deletedAt),
              isNull(policy.renewalReminderSentAt),
              ne(policy.status, 'archived'),
              lte(policy.renewBy, windowEnd),
            ),
          ),
      );
      for (const p of due) {
        if (!p.ownerMembershipId) continue;
        const [person] = await this.dbService.db
          .select({ email: user.email, locale: user.locale })
          .from(membership)
          .innerJoin(user, eq(membership.userId, user.id))
          .where(eq(membership.id, p.ownerMembershipId));
        if (!person) continue;
        const parsedLocale = localeSchema.safeParse(person.locale);
        await this.emailService.sendTemplate(
          'policy-renewal',
          parsedLocale.success ? parsedLocale.data : 'en',
          person.email,
          {
            policyTitle: p.titleI18n.en,
            renewBy: p.renewBy?.toISOString().slice(0, 10) ?? '',
          },
        );
        sent += 1;
        await this.dbService.withTenant(t.id, (tx) =>
          tx
            .update(policy)
            .set({ renewalReminderSentAt: sql`now()` })
            .where(eq(policy.id, p.id)),
        );
      }
    }
    return { sent };
  }
}
