import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { kbEntry, membership, user } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    actor: Actor,
    input: {
      question: string;
      answer: string;
      category?: string;
      tags?: unknown[];
      ownerMembershipId?: string;
      expiresAt?: string;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(kbEntry)
        .values({
          tenantId: actor.tenantId,
          question: input.question,
          answer: input.answer,
          category: input.category ?? null,
          tags: input.tags ?? [],
          ownerMembershipId: input.ownerMembershipId ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning();
      if (!row) throw new Error('KB-запись не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'kb_entry.created',
      entityType: 'kb_entry',
      entityId: created.id,
      after: { question: created.question },
    });
    return { id: created.id };
  }

  /** Поиск по ключевому слову (ILIKE по question/answer); пустой q → все. */
  async search(tenantId: string, q?: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) => {
      const conds: SQL[] = [isNull(kbEntry.deletedAt)];
      if (q && q.trim()) {
        const like = `%${q.trim()}%`;
        conds.push(or(ilike(kbEntry.question, like), ilike(kbEntry.answer, like))!);
      }
      return tx
        .select({
          id: kbEntry.id,
          question: kbEntry.question,
          answer: kbEntry.answer,
          category: kbEntry.category,
          expiresAt: kbEntry.expiresAt,
          ownerMembershipId: kbEntry.ownerMembershipId,
          owner: user.fullName,
        })
        .from(kbEntry)
        .leftJoin(membership, eq(kbEntry.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .where(and(...conds))
        .orderBy(desc(kbEntry.createdAt));
    });
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      category: r.category,
      owner: r.owner ?? null,
      ownerMembershipId: r.ownerMembershipId,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      // T-V43: verified — ответ актуален (нет срока или срок в будущем); expired — истёк
      verified: !r.expiresAt || r.expiresAt.getTime() > now,
    }));
  }

  /** T-V43: правка KB-записи — owner, срок, текст. */
  async update(
    actor: Actor,
    id: string,
    input: {
      question?: string;
      answer?: string;
      category?: string | null;
      ownerMembershipId?: string | null;
      expiresAt?: string | null;
    },
  ) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: kbEntry.id })
        .from(kbEntry)
        .where(and(eq(kbEntry.id, id), isNull(kbEntry.deletedAt)));
      if (!row) throw new NotFoundException(`KB-запись ${id} не найдена`);
      const patch: Record<string, unknown> = {};
      if (input.question !== undefined) patch.question = input.question;
      if (input.answer !== undefined) patch.answer = input.answer;
      if (input.category !== undefined) patch.category = input.category;
      if (input.ownerMembershipId !== undefined) patch.ownerMembershipId = input.ownerMembershipId;
      if (input.expiresAt !== undefined) {
        patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      }
      if (Object.keys(patch).length === 0) throw new BadRequestException('Нечего обновлять');
      const [res] = await tx.update(kbEntry).set(patch).where(eq(kbEntry.id, id)).returning();
      return res!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'kb_entry.updated',
      entityType: 'kb_entry',
      entityId: id,
      after: { ownerMembershipId: updated.ownerMembershipId, expiresAt: updated.expiresAt },
    });
    return { id: updated.id };
  }
}
