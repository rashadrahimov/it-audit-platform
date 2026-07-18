import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { trustAccessRequest, trustCenter, trustCenterItem } from '../db/schema';

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

  async addItem(actor: Actor, input: { label: string; category: string; published?: boolean }) {
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
      .where(
        and(
          eq(trustCenter.slug, slug),
          eq(trustCenter.isPublic, true),
          isNull(trustCenter.deletedAt),
        ),
      );
    if (!tc) throw new NotFoundException('Trust Center не найден или не опубликован');
    const items = await this.dbService.withTenant(tc.tenantId, (tx) =>
      tx
        .select({ label: trustCenterItem.label, category: trustCenterItem.category })
        .from(trustCenterItem)
        .where(and(eq(trustCenterItem.trustCenterId, tc.id), eq(trustCenterItem.published, true))),
    );
    return { slug: tc.slug, title: tc.title, intro: tc.intro, items };
  }

  /** ПУБЛИЧНЫЙ (без auth) запрос доступа к деталям Trust Center по slug (T-081). */
  async requestAccess(slug: string, input: { email: string; company?: string; message?: string }) {
    const [tc] = await this.dbService.db
      .select({ id: trustCenter.id, tenantId: trustCenter.tenantId })
      .from(trustCenter)
      .where(
        and(
          eq(trustCenter.slug, slug),
          eq(trustCenter.isPublic, true),
          isNull(trustCenter.deletedAt),
        ),
      );
    if (!tc) throw new NotFoundException('Trust Center не найден или не опубликован');
    const created = await this.dbService.withTenant(tc.tenantId, async (tx) => {
      const [row] = await tx
        .insert(trustAccessRequest)
        .values({
          trustCenterId: tc.id,
          email: input.email,
          company: input.company ?? null,
          message: input.message ?? null,
        })
        .returning();
      if (!row) throw new Error('Запрос не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: tc.tenantId,
      actorUserId: null,
      action: 'trust_access_request.created',
      entityType: 'trust_access_request',
      entityId: created.id,
      after: { email: input.email },
    });
    return { id: created.id, status: created.status };
  }

  async listAccessRequests(tenantId: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [tc] = await tx
        .select({ id: trustCenter.id })
        .from(trustCenter)
        .where(and(eq(trustCenter.tenantId, tenantId), isNull(trustCenter.deletedAt)));
      if (!tc) throw new NotFoundException('Trust Center не настроен');
      const rows = await tx
        .select()
        .from(trustAccessRequest)
        .where(eq(trustAccessRequest.trustCenterId, tc.id));
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        company: r.company,
        status: r.status,
      }));
    });
  }

  async decideAccessRequest(actor: Actor, id: string, to: string) {
    if (to !== 'approved' && to !== 'denied') {
      throw new BadRequestException('Решение: approved|denied');
    }
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ status: trustAccessRequest.status })
        .from(trustAccessRequest)
        .where(eq(trustAccessRequest.id, id));
      if (!row) throw new NotFoundException(`Запрос ${id} не найден`);
      if (row.status !== 'pending') {
        throw new BadRequestException(`Запрос уже ${row.status}`);
      }
      await tx.update(trustAccessRequest).set({ status: to }).where(eq(trustAccessRequest.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'trust_access_request.decided',
      entityType: 'trust_access_request',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }
}
