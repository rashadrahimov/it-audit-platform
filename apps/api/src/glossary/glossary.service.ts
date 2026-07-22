import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ilike, isNull, type SQL } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { glossaryTerm } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class GlossaryService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Термины: global (сид) + кастомные тенанта (RLS read); ?q — поиск по термину. */
  async list(tenantId: string, locale: Locale, q?: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) => {
      const conds: SQL[] = [isNull(glossaryTerm.deletedAt)];
      if (q && q.trim()) conds.push(ilike(glossaryTerm.term, `%${q.trim()}%`));
      return tx
        .select()
        .from(glossaryTerm)
        .where(and(...conds))
        .orderBy(asc(glossaryTerm.term));
    });
    return rows.map((t) => ({
      id: t.id,
      term: t.term,
      definition: resolveLocalized(t.definitionI18n, locale),
      definitionI18n: t.definitionI18n,
      category: t.category,
      isGlobal: t.tenantId === null,
    }));
  }

  async create(actor: Actor, input: { term: string; definitionI18n: I18nText; category?: string }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(glossaryTerm)
        .values({
          tenantId: actor.tenantId,
          term: input.term,
          definitionI18n: input.definitionI18n,
          category: input.category ?? null,
        })
        .onConflictDoNothing({ target: [glossaryTerm.tenantId, glossaryTerm.term] })
        .returning();
      if (!row) throw new BadRequestException(`Термин «${input.term}» уже существует`);
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'glossary_term.created',
      entityType: 'glossary_term',
      entityId: created.id,
      after: { term: created.term },
    });
    return { id: created.id, term: created.term };
  }

  async update(
    actor: Actor,
    id: string,
    input: { term?: string; definitionI18n?: I18nText; category?: string },
  ) {
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(glossaryTerm)
        .where(
          and(
            eq(glossaryTerm.id, id),
            eq(glossaryTerm.tenantId, actor.tenantId),
            isNull(glossaryTerm.deletedAt),
          ),
        );
      if (!existing) throw new NotFoundException(`Кастомный термин ${id} не найден`);

      try {
        const [row] = await tx
          .update(glossaryTerm)
          .set({
            ...(input.term !== undefined ? { term: input.term } : {}),
            ...(input.definitionI18n !== undefined ? { definitionI18n: input.definitionI18n } : {}),
            ...(input.category !== undefined ? { category: input.category || null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(glossaryTerm.id, id))
          .returning();
        if (!row) throw new NotFoundException(`Кастомный термин ${id} не найден`);
        return { before: existing, row };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new BadRequestException(`Термин «${input.term}» уже существует`);
        }
        throw error;
      }
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'glossary_term.updated',
      entityType: 'glossary_term',
      entityId: id,
      before: { term: updated.before.term },
      after: { term: updated.row.term },
    });
    return { id: updated.row.id, term: updated.row.term };
  }

  async remove(actor: Actor, id: string) {
    const [removed] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .update(glossaryTerm)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(glossaryTerm.id, id),
            eq(glossaryTerm.tenantId, actor.tenantId),
            isNull(glossaryTerm.deletedAt),
          ),
        )
        .returning({ id: glossaryTerm.id, term: glossaryTerm.term }),
    );
    if (!removed) throw new NotFoundException(`Кастомный термин ${id} не найден`);
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'glossary_term.deleted',
      entityType: 'glossary_term',
      entityId: id,
      before: { term: removed.term },
    });
  }
}
