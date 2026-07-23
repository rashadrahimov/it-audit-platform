import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { kbEntry, membership, questionnaire, questionnaireAnswer } from '../db/schema';
import { suggestKbForQuestion } from './answer-suggest';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class QuestionnairesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async assertOwner(tenantId: string, ownerMembershipId?: string | null) {
    if (!ownerMembershipId) return;
    const [owner] = await this.dbService.db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.id, ownerMembershipId), eq(membership.tenantId, tenantId)));
    if (!owner) throw new BadRequestException('Владелец не относится к текущему тенанту');
  }

  async create(
    actor: Actor,
    input: { title: string; source?: string; ownerMembershipId?: string; dueDate?: string },
  ) {
    await this.assertOwner(actor.tenantId, input.ownerMembershipId);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(questionnaire)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          source: input.source ?? null,
          ownerMembershipId: input.ownerMembershipId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        })
        .returning();
      if (!row) throw new Error('Опросник не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'questionnaire.created',
      entityType: 'questionnaire',
      entityId: created.id,
      after: { title: created.title },
    });
    return { id: created.id, status: created.status };
  }

  async importWorkbook(
    actor: Actor,
    input: { title: string; source?: string; ownerMembershipId?: string; dueDate?: string },
    questions: string[],
  ) {
    await this.assertOwner(actor.tenantId, input.ownerMembershipId);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(questionnaire)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          source: input.source ?? null,
          ownerMembershipId: input.ownerMembershipId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
        })
        .returning({ id: questionnaire.id, status: questionnaire.status });
      if (!row) throw new Error('Опросник не создался');
      await tx
        .insert(questionnaireAnswer)
        .values(questions.map((question) => ({ questionnaireId: row.id, question })));
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'questionnaire.imported',
      entityType: 'questionnaire',
      entityId: created.id,
      after: { questions: questions.length, source: input.source ?? null },
    });
    return { ...created, questions: questions.length };
  }

  async update(
    actor: Actor,
    id: string,
    input: { ownerMembershipId?: string | null; dueDate?: string | null },
  ) {
    await this.assertOwner(actor.tenantId, input.ownerMembershipId);
    const changes: { ownerMembershipId?: string | null; dueDate?: Date | null } = {};
    if ('ownerMembershipId' in input) changes.ownerMembershipId = input.ownerMembershipId ?? null;
    if ('dueDate' in input) changes.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (Object.keys(changes).length === 0) throw new BadRequestException('Нет изменений');
    const updated = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .update(questionnaire)
        .set(changes)
        .where(and(eq(questionnaire.id, id), isNull(questionnaire.deletedAt)))
        .returning({ id: questionnaire.id });
      if (!row) throw new NotFoundException(`Опросник ${id} не найден`);
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'questionnaire.updated',
      entityType: 'questionnaire',
      entityId: id,
      after: input,
    });
    return updated;
  }

  async addQuestion(actor: Actor, questionnaireId: string, question: string) {
    return this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [q] = await tx
        .select({ id: questionnaire.id })
        .from(questionnaire)
        .where(and(eq(questionnaire.id, questionnaireId), isNull(questionnaire.deletedAt)));
      if (!q) throw new NotFoundException(`Опросник ${questionnaireId} не найден`);
      const [row] = await tx
        .insert(questionnaireAnswer)
        .values({ questionnaireId, question })
        .returning();
      return { id: row!.id, status: row!.status };
    });
  }

  /** Ответить вручную (answer) или переиспользовать KB-запись (kbEntryId → копирует answer). */
  async answer(actor: Actor, answerId: string, input: { answer?: string; kbEntryId?: string }) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: questionnaireAnswer.id })
        .from(questionnaireAnswer)
        .where(eq(questionnaireAnswer.id, answerId));
      if (!row) throw new NotFoundException(`Ответ ${answerId} не найден`);
      let answerText = input.answer;
      let kbEntryId: string | null = null;
      if (input.kbEntryId) {
        const [kb] = await tx
          .select({ answer: kbEntry.answer })
          .from(kbEntry)
          .where(and(eq(kbEntry.id, input.kbEntryId), isNull(kbEntry.deletedAt)));
        if (!kb) throw new BadRequestException(`KB-запись ${input.kbEntryId} не найдена`);
        answerText = kb.answer;
        kbEntryId = input.kbEntryId;
      }
      if (!answerText || !answerText.trim()) {
        throw new BadRequestException('Нужен answer или kbEntryId');
      }
      await tx
        .update(questionnaireAnswer)
        .set({ answer: answerText, kbEntryId, status: 'answered' })
        .where(eq(questionnaireAnswer.id, answerId));
      return { reused: kbEntryId !== null };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'questionnaire.answered',
      entityType: 'questionnaire_answer',
      entityId: answerId,
      after: { reused: result.reused },
    });
    return { id: answerId, status: 'answered', reused: result.reused };
  }

  /** Отправить: все ответы должны быть answered, иначе 400. */
  async submit(actor: Actor, questionnaireId: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [q] = await tx
        .select()
        .from(questionnaire)
        .where(and(eq(questionnaire.id, questionnaireId), isNull(questionnaire.deletedAt)));
      if (!q) throw new NotFoundException(`Опросник ${questionnaireId} не найден`);
      if (q.status === 'submitted') throw new BadRequestException('Уже отправлен');
      const answers = await tx
        .select({ status: questionnaireAnswer.status })
        .from(questionnaireAnswer)
        .where(eq(questionnaireAnswer.questionnaireId, questionnaireId));
      if (answers.length === 0) throw new BadRequestException('В опроснике нет вопросов');
      const pending = answers.filter((a) => a.status !== 'answered').length;
      if (pending > 0) throw new BadRequestException(`Не отвечено вопросов: ${pending}`);
      await tx
        .update(questionnaire)
        .set({ status: 'submitted' })
        .where(eq(questionnaire.id, questionnaireId));
      return { answered: answers.length };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'questionnaire.submitted',
      entityType: 'questionnaire',
      entityId: questionnaireId,
      after: { answered: result.answered },
    });
    return { id: questionnaireId, status: 'submitted' };
  }

  async list(tenantId: string, filters?: { status?: string }) {
    const conds = [isNull(questionnaire.deletedAt)];
    if (filters?.status) conds.push(eq(questionnaire.status, filters.status));
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(questionnaire)
        .where(and(...conds))
        .orderBy(desc(questionnaire.createdAt)),
    );
    return rows.map((q) => ({
      id: q.id,
      title: q.title,
      source: q.source,
      status: q.status,
      ownerMembershipId: q.ownerMembershipId,
      dueDate: q.dueDate,
    }));
  }

  /**
   * T-V42: детерминированный auto-suggest — для каждого НЕотвеченного вопроса
   * предлагает лучший KB-ответ (матчинг токенов, без LLM). Один клик → answer(kbEntryId).
   */
  async suggestions(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [q] = await tx
        .select({ id: questionnaire.id })
        .from(questionnaire)
        .where(and(eq(questionnaire.id, id), isNull(questionnaire.deletedAt)));
      if (!q) throw new NotFoundException(`Опросник ${id} не найден`);
      const pending = await tx
        .select({ id: questionnaireAnswer.id, question: questionnaireAnswer.question })
        .from(questionnaireAnswer)
        .where(
          and(
            eq(questionnaireAnswer.questionnaireId, id),
            eq(questionnaireAnswer.status, 'pending'),
          ),
        );
      const kb = await tx
        .select({ id: kbEntry.id, question: kbEntry.question, answer: kbEntry.answer })
        .from(kbEntry)
        .where(isNull(kbEntry.deletedAt));
      const suggestions: Record<
        string,
        { kbEntryId: string; kbQuestion: string; suggestedAnswer: string; score: number }
      > = {};
      for (const a of pending) {
        const s = suggestKbForQuestion(a.question, kb);
        if (s) suggestions[a.id] = s;
      }
      return suggestions;
    });
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [q] = await tx
        .select()
        .from(questionnaire)
        .where(and(eq(questionnaire.id, id), isNull(questionnaire.deletedAt)));
      if (!q) throw new NotFoundException(`Опросник ${id} не найден`);
      const answers = await tx
        .select()
        .from(questionnaireAnswer)
        .where(eq(questionnaireAnswer.questionnaireId, id));
      return {
        id: q.id,
        title: q.title,
        source: q.source,
        status: q.status,
        ownerMembershipId: q.ownerMembershipId,
        dueDate: q.dueDate,
        answers: answers.map((a) => ({
          id: a.id,
          question: a.question,
          answer: a.answer,
          status: a.status,
          reusedFromKb: a.kbEntryId !== null,
        })),
      };
    });
  }
}
