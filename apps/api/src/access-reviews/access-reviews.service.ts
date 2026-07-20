import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { accessReview, accessReviewItem, account, finding, membership } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

const DECISIONS = ['certify', 'revoke', 'modify'];

/** Access Review / UAR (T-055, ADR-0012): кампания сверки доступа + решения reviewer. */
@Injectable()
export class AccessReviewsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Создать кампанию: item на каждый указанный аккаунт (или все активные при пустом scope). */
  async create(actor: Actor, input: { title: string; accountIds?: string[]; dueDate?: string }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const accounts = input.accountIds?.length
        ? await tx
            .select({ id: account.id })
            .from(account)
            .where(inArray(account.id, input.accountIds))
        : await tx.select({ id: account.id }).from(account).where(eq(account.status, 'active'));
      if (accounts.length === 0) throw new BadRequestException('Нет аккаунтов для ревью');

      const [review] = await tx
        .insert(accessReview)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          scope: { accountIds: accounts.map((a) => a.id) },
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        })
        .returning();
      if (!review) throw new Error('Ревью не создалось');
      await tx
        .insert(accessReviewItem)
        .values(accounts.map((a) => ({ reviewId: review.id, accountId: a.id })));
      return { review, count: accounts.length };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'access_review.created',
      entityType: 'access_review',
      entityId: created.review.id,
      after: { title: created.review.title, accounts: created.count },
    });
    return { id: created.review.id, accounts: created.count, status: created.review.status };
  }

  /** Решение reviewer по пункту (certify/revoke/modify). */
  async decide(actor: Actor, reviewId: string, itemId: string, decision: string) {
    if (!DECISIONS.includes(decision)) {
      throw new BadRequestException(`decision: ожидается ${DECISIONS.join('|')}`);
    }
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [reviewer] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
      const [row] = await tx
        .update(accessReviewItem)
        .set({
          decision,
          decidedAt: new Date(),
          reviewerMembershipId: reviewer?.id ?? null,
        })
        .where(and(eq(accessReviewItem.id, itemId), eq(accessReviewItem.reviewId, reviewId)))
        .returning();
      if (!row) throw new NotFoundException('Пункт ревью не найден');
      // revoke → деактивация аккаунта (deprovisioning придёт задачей в T-056)
      if (decision === 'revoke') {
        await tx
          .update(account)
          .set({ status: 'deactivated', deactivatedInSource: sql`now()` })
          .where(eq(account.id, row.accountId));
        // T-V08: revoke порождает finding (оживлён задел item.finding_id из T-055)
        const [acc] = await tx
          .select({ identifier: account.identifier })
          .from(account)
          .where(eq(account.id, row.accountId));
        const [created] = await tx
          .insert(finding)
          .values({
            tenantId: actor.tenantId,
            titleI18n: {
              en: `Access revoked during UAR: ${acc?.identifier ?? row.accountId}`,
              ru: `Доступ отозван при UAR: ${acc?.identifier ?? row.accountId}`,
            },
            riskRating: 'medium',
          })
          .returning({ id: finding.id });
        if (created) {
          await tx
            .update(accessReviewItem)
            .set({ findingId: created.id })
            .where(eq(accessReviewItem.id, itemId));
        }
      }
      // все пункты решены → кампания completed
      const pending = await tx
        .select({ id: accessReviewItem.id })
        .from(accessReviewItem)
        .where(and(eq(accessReviewItem.reviewId, reviewId), isNull(accessReviewItem.decision)));
      if (pending.length === 0) {
        await tx
          .update(accessReview)
          .set({ status: 'completed' })
          .where(eq(accessReview.id, reviewId));
      }
      return { decision, remaining: pending.length };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'access_review.decided',
      entityType: 'access_review',
      entityId: reviewId,
      after: { itemId, decision },
    });
    return result;
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(accessReview)
        .where(isNull(accessReview.deletedAt))
        .orderBy(asc(accessReview.createdAt)),
    );
    return rows.map((r) => ({ id: r.id, title: r.title, status: r.status }));
  }

  async detail(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [review] = await tx
        .select()
        .from(accessReview)
        .where(and(eq(accessReview.id, id), isNull(accessReview.deletedAt)));
      if (!review) throw new NotFoundException(`Ревью ${id} не найдено`);
      const items = await tx
        .select({
          id: accessReviewItem.id,
          decision: accessReviewItem.decision,
          identifier: account.identifier,
          displayName: account.displayName,
          mfaEnabled: account.mfaEnabled,
        })
        .from(accessReviewItem)
        .innerJoin(account, eq(accessReviewItem.accountId, account.id))
        .where(eq(accessReviewItem.reviewId, id));
      return {
        id: review.id,
        title: review.title,
        status: review.status,
        items: items.map((i) => ({
          id: i.id,
          account: i.identifier,
          displayName: i.displayName,
          mfaEnabled: i.mfaEnabled,
          decision: i.decision,
        })),
      };
    });
  }
}
