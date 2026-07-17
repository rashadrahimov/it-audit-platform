import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { user } from '../db/schema';

/** Кто выполняет операцию — для audit trail (null = система). */
export interface Actor {
  userId?: string | null;
  ip?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Offboarding (T-017): деактивированный не пройдёт логин (проверка в AuthService.login). */
  async deactivate(userId: string, actor: Actor = {}): Promise<void> {
    const [updated] = await this.dbService.db
      .update(user)
      .set({ status: 'deactivated' })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (!updated) throw new NotFoundException(`Пользователь ${userId} не найден`);
    await this.auditLogService.record({
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'user.deactivated',
      entityType: 'user',
      entityId: userId,
    });
  }

  /**
   * Авто-деактивация неактивных (T-017): не логинился дольше days
   * (для ни разу не входивших отсчёт — от created_at). Возвращает число задетых.
   */
  async deactivateInactive(days: number): Promise<number> {
    if (days <= 0) return 0;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const updated = await this.dbService.db
      .update(user)
      .set({ status: 'deactivated' })
      .where(
        and(
          eq(user.status, 'active'),
          or(
            lt(user.lastLoginAt, cutoff),
            and(isNull(user.lastLoginAt), lt(user.createdAt, cutoff)),
          ),
        ),
      )
      .returning({ id: user.id });
    if (updated.length > 0) {
      console.log(`Авто-деактивация: ${updated.length} аккаунт(ов) неактивны > ${days} дн.`);
    }
    return updated.length;
  }

  /** Для симметрии offboarding'а — вернуть доступ может только админ. */
  async reactivate(userId: string): Promise<void> {
    const [updated] = await this.dbService.db
      .update(user)
      .set({ status: 'active', failedLoginCount: 0, lockedUntil: null, lastLoginAt: sql`now()` })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (!updated) throw new NotFoundException(`Пользователь ${userId} не найден`);
  }
}
