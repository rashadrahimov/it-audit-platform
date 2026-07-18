import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { kbEntry, questionnaire, questionnaireAnswer } from '../db/schema';

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

  async create(actor: Actor, input: { title: string; source?: string }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(questionnaire)
        .values({ tenantId: actor.tenantId, title: input.title, source: input.source ?? null })
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
  async answer(
    actor: Actor,
    answerId: string,
    input: { answer?: string; kbEntryId?: string },
  ) {
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

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(questionnaire)
        .where(isNull(questionnaire.deletedAt))
        .orderBy(desc(questionnaire.createdAt)),
    );
    return rows.map((q) => ({ id: q.id, title: q.title, source: q.source, status: q.status }));
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
