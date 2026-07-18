import { Injectable } from '@nestjs/common';
import { and, desc, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { kbEntry } from '../db/schema';

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
    input: { question: string; answer: string; category?: string; tags?: unknown[] },
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
    return this.dbService.withTenant(tenantId, (tx) => {
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
        })
        .from(kbEntry)
        .where(and(...conds))
        .orderBy(desc(kbEntry.createdAt));
    });
  }
}
