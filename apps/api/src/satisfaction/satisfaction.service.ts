import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { engagement, membership, satisfactionSurvey } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class SatisfactionService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async submit(actor: Actor, input: { engagementId: string; rating: number; comment?: string }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagement.id })
        .from(engagement)
        .where(and(eq(engagement.id, input.engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new BadRequestException(`Engagement ${input.engagementId} не найден`);
      const [me] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
      const [row] = await tx
        .insert(satisfactionSurvey)
        .values({
          tenantId: actor.tenantId,
          engagementId: input.engagementId,
          respondentMembershipId: me?.id ?? null,
          rating: input.rating,
          comment: input.comment ?? null,
        })
        .returning();
      if (!row) throw new Error('Оценка не сохранилась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'satisfaction_survey.submitted',
      entityType: 'satisfaction_survey',
      entityId: created.id,
      after: { rating: created.rating },
    });
    return { id: created.id, rating: created.rating };
  }

  /** Средний рейтинг + число ответов по engagement. */
  async summary(tenantId: string, engagementId: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          count: sql<string>`count(*)`,
          avg: sql<string | null>`avg(${satisfactionSurvey.rating})`,
        })
        .from(satisfactionSurvey)
        .where(eq(satisfactionSurvey.engagementId, engagementId)),
    );
    const count = Number(row?.count ?? 0);
    const average = row?.avg != null ? Number(Number(row.avg).toFixed(2)) : null;
    return { engagementId, responses: count, averageRating: average };
  }
}
