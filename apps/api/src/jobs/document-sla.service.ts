import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { localeSchema } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { document, membership, tenant, user } from '../db/schema';

/**
 * T-V02: SLA-джоба документов — доказательство с истёкшим renew_by (и статусом
 * active) само становится overdue, владелец получает письмо. Переход статуса и есть
 * дедуп: следующий прогон уже не выберет overdue-документ повторно.
 */
@Injectable()
export class DocumentSlaService {
  constructor(
    private readonly dbService: DbService,
    private readonly emailService: EmailService,
  ) {}

  async run(now = new Date()): Promise<{ overdue: number; emails: number }> {
    const tenants = await this.dbService.db.select({ id: tenant.id }).from(tenant);
    let overdue = 0;
    let emails = 0;
    for (const t of tenants) {
      const due = await this.dbService.withTenant(t.id, (tx) =>
        tx
          .update(document)
          .set({ status: 'overdue' })
          .where(
            and(
              isNull(document.deletedAt),
              eq(document.status, 'active'),
              lte(document.renewBy, now),
            ),
          )
          .returning({
            id: document.id,
            filename: document.filename,
            renewBy: document.renewBy,
            ownerMembershipId: document.ownerMembershipId,
          }),
      );
      overdue += due.length;
      for (const d of due) {
        const [person] = await this.dbService.db
          .select({ email: user.email, locale: user.locale })
          .from(membership)
          .innerJoin(user, eq(membership.userId, user.id))
          .where(eq(membership.id, d.ownerMembershipId));
        if (!person?.email) continue;
        const parsed = localeSchema.safeParse(person.locale);
        await this.emailService.sendTemplate(
          'document-overdue',
          parsed.success ? parsed.data : 'en',
          person.email,
          {
            filename: d.filename,
            renewBy: d.renewBy?.toISOString().slice(0, 10) ?? '',
          },
        );
        emails += 1;
      }
    }
    return { overdue, emails };
  }
}
