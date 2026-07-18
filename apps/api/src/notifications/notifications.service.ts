import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { membership, notification } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly dbService: DbService) {}

  private myMembership(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], actor: Actor) {
    return tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)))
      .then((r) => r[0]?.id ?? null);
  }

  async create(
    actor: Actor,
    input: { recipientMembershipId: string; title: string; type?: string; body?: string },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(notification)
        .values({
          tenantId: actor.tenantId,
          recipientMembershipId: input.recipientMembershipId,
          title: input.title,
          type: input.type ?? 'info',
          body: input.body ?? null,
        })
        .returning();
      if (!row) throw new Error('Уведомление не создалось');
      return row;
    });
    return { id: created.id };
  }

  /** Только уведомления, адресованные текущему пользователю. */
  async listMine(actor: Actor) {
    return this.dbService.withTenant(actor.tenantId, async (tx) => {
      const meId = await this.myMembership(tx, actor);
      if (!meId) return { unread: 0, items: [] };
      const rows = await tx
        .select()
        .from(notification)
        .where(eq(notification.recipientMembershipId, meId))
        .orderBy(desc(notification.createdAt));
      return {
        unread: rows.filter((r) => r.readAt === null).length,
        items: rows.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          body: r.body,
          read: r.readAt !== null,
        })),
      };
    });
  }

  async markRead(actor: Actor, id: string) {
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const meId = await this.myMembership(tx, actor);
      const updated = await tx
        .update(notification)
        .set({ readAt: sql`now()` })
        .where(
          and(
            eq(notification.id, id),
            eq(notification.recipientMembershipId, meId ?? '00000000-0000-0000-0000-000000000000'),
            isNull(notification.readAt),
          ),
        )
        .returning({ id: notification.id });
      if (updated.length === 0) {
        // либо не адресовано мне, либо уже прочитано — не раскрываем чужие
        const [exists] = await tx
          .select({ id: notification.id })
          .from(notification)
          .where(eq(notification.id, id));
        if (!exists) throw new NotFoundException(`Уведомление ${id} не найдено`);
      }
    });
    return { read: true };
  }
}
