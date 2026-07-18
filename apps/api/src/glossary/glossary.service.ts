import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, ilike, isNull, type SQL } from 'drizzle-orm';
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
}
