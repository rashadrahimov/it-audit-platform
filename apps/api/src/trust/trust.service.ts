import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { trustCenter, trustCenterItem } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

@Injectable()
export class TrustService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Настроить/обновить Trust Center тенанта (один на тенант, upsert по tenant). */
  async configure(
    actor: Actor,
    input: { slug: string; title: string; intro?: string; isPublic?: boolean },
  ) {
    const row = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(trustCenter)
        .where(and(eq(trustCenter.tenantId, actor.tenantId), isNull(trustCenter.deletedAt)));
      if (existing) {
        const [updated] = await tx
          .update(trustCenter)
          .set({
            slug: input.slug,
            title: input.title,
            intro: input.intro ?? existing.intro,
            isPublic: input.isPublic ?? existing.isPublic,
          })
          .where(eq(trustCenter.id, existing.id))
          .returning();
        return updated!;
      }
      const [created] = await tx
        .insert(trustCenter)
        .values({
          tenantId: actor.tenantId,
          slug: input.slug,
          title: input.title,
          intro: input.intro ?? null,
          isPublic: input.isPublic ?? false,
        })
        .returning();
      if (!created) throw new Error('Trust Center не создался');
      return created;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'trust_center.configured',
      entityType: 'trust_center',
      entityId: row.id,
      after: { slug: row.slug, isPublic: row.isPublic },
    });
    return { id: row.id, slug: row.slug, isPublic: row.isPublic };
  }

  async addItem(
    actor: Actor,
    input: { label: string; category: string; published?: boolean },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [tc] = await tx
        .select({ id: trustCenter.id })
        .from(trustCenter)
        .where(and(eq(trustCenter.tenantId, actor.tenantId), isNull(trustCenter.deletedAt)));
      if (!tc) throw new BadRequestException('Сначала настройте Trust Center (POST /trust-center)');
      const [row] = await tx
        .insert(trustCenterItem)
        .values({
          trustCenterId: tc.id,
          label: input.label,
          category: input.category,
          published: input.published ?? true,
        })
        .returning();
      if (!row) throw new Error('Элемент не создался');
      return row;
    });
    return { id: created.id, published: created.published };
  }

  /** Админ-вид (все items, в т.ч. неопубликованные). */
  async adminGet(tenantId: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [tc] = await tx
        .select()
        .from(trustCenter)
        .where(and(eq(trustCenter.tenantId, tenantId), isNull(trustCenter.deletedAt)));
      if (!tc) throw new NotFoundException('Trust Center не настроен');
      const items = await tx
        .select()
        .from(trustCenterItem)
        .where(eq(trustCenterItem.trustCenterId, tc.id));
      return {
        slug: tc.slug,
        title: tc.title,
        intro: tc.intro,
        isPublic: tc.isPublic,
        items: items.map((i) => ({
          id: i.id,
          label: i.label,
          category: i.category,
          published: i.published,
        })),
      };
    });
  }

  /**
   * ПУБЛИЧНЫЙ вид по slug (без auth): только если is_public, только published items.
   * trust_center читается public-read RLS-политикой; items — под withTenant(владелец).
   */
  async publicView(slug: string) {
    const [tc] = await this.dbService.db
      .select()
      .from(trustCenter)
      .where(and(eq(trustCenter.slug, slug), eq(trustCenter.isPublic, true), isNull(trustCenter.deletedAt)));
    if (!tc) throw new NotFoundException('Trust Center не найден или не опубликован');
    const items = await this.dbService.withTenant(tc.tenantId, (tx) =>
      tx
        .select({ label: trustCenterItem.label, category: trustCenterItem.category })
        .from(trustCenterItem)
        .where(and(eq(trustCenterItem.trustCenterId, tc.id), eq(trustCenterItem.published, true))),
    );
    return { slug: tc.slug, title: tc.title, intro: tc.intro, items };
  }
}
