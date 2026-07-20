import { and, eq } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import type { DbService } from '../db/db.service';
import { membership } from '../db/schema';

/**
 * Scoped Auditor View (T-111, EP-AUDITOR-RELATIONSHIP).
 *
 * Для внешнего аудитора (`category='external_auditor'`) с заданным
 * `subsidiary_scope` возвращает список дочек, которыми ограничена видимость
 * основных списков (engagements/findings/documents).
 *
 * - `null` — ограничения нет: внутренние роли ИЛИ внешний аудитор с полным
 *   скоупом (`subsidiary_scope IS NULL` = вся группа).
 * - `[]` — внешний аудитор с пустым скоупом: не видит ни одной дочки.
 *
 * membership — над-тенантная control-plane таблица (без RLS), поэтому читается
 * через `dbService.db` с явным фильтром по tenantId (как в GroupService).
 */
export async function resolveAuditorScope(
  dbService: DbService,
  tenantId: string,
  userId: string,
): Promise<string[] | null> {
  const [me] = await dbService.db
    .select({ category: membership.category, scope: membership.subsidiaryScope })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.tenantId, tenantId)));
  if (!me || me.category !== 'external_auditor') return null;
  return me.scope ?? null;
}

/**
 * Guard для чтения по прямому ID (T-122, follow-up к T-111).
 *
 * Списки режутся `resolveAuditorScope`, но чтение по ID (GET /engagements/:id,
 * /findings/:id, скачивание документа) раньше scope не проверяло — внешний
 * аудитор мог прочитать чужую дочку, зная ID. Этот guard закрывает обход.
 *
 * Бросает `NotFoundException` (а не Forbidden — не раскрываем существование
 * ресурса вне scope), если сущность привязана к дочке вне скоупа аудитора.
 * `subsidiaryId === null` для scoped-аудитора трактуется как «вне доступа»
 * (standalone/без дочки — как и в списках, скрыто). Для не ограниченного
 * актора (`scope === null`) — no-op.
 */
export async function assertSubsidiaryInAuditorScope(
  dbService: DbService,
  tenantId: string,
  userId: string,
  subsidiaryId: string | null,
): Promise<void> {
  const scope = await resolveAuditorScope(dbService, tenantId, userId);
  if (scope === null) return;
  if (subsidiaryId === null || !scope.includes(subsidiaryId)) {
    throw new NotFoundException('Ресурс не найден');
  }
}

/**
 * Категория активного membership актора в тенанте (для auditor-gate: ревьюит/
 * оценивает только аудитор). null = нет активного membership.
 */
export async function resolveActorCategory(
  dbService: DbService,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const [m] = await dbService.db
    .select({ category: membership.category })
    .from(membership)
    .where(
      and(
        eq(membership.userId, userId),
        eq(membership.tenantId, tenantId),
        eq(membership.status, 'active'),
      ),
    );
  return m?.category ?? null;
}
