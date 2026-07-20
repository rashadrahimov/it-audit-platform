import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DocumentsService } from '../documents/documents.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { DbService } from '../db/db.service';
import { document, framework, membership, policy, policyVersion, user } from '../db/schema';
import { POLICY_TEMPLATES } from '../seed-data/policy-templates';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface CreatePolicyInput {
  titleI18n: I18nText;
  ownerMembershipId?: string;
  approverMembershipId?: string;
  renewBy?: string;
  frameworkIds?: string[];
}

/** Политики (T-051, B4): CRUD + версии-документы. Workflow — T-052, attestation — T-053. */
@Injectable()
export class PoliciesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationDispatch: NotificationDispatchService,
    private readonly documentsService: DocumentsService,
  ) {}

  /** T-V24: каталог шаблонов политик (статичный контент EN/AZ/RU). */
  templates(locale: Locale) {
    return POLICY_TEMPLATES.map((tpl) => ({
      key: tpl.key,
      title: resolveLocalized(tpl.title, locale),
      preview: resolveLocalized(tpl.body, locale).slice(0, 400),
    }));
  }

  /** T-V24: политика из шаблона — policy + markdown-документ (3 языка) + версия v1. */
  async createFromTemplate(actor: Actor, templateKey: string) {
    const tpl = POLICY_TEMPLATES.find((p) => p.key === templateKey);
    if (!tpl) throw new NotFoundException(`Шаблон «${templateKey}» не найден`);
    const created = await this.create(actor, { titleI18n: tpl.title });
    const markdown = `${tpl.body.en}\n---\n\n${tpl.body.az}\n---\n\n${tpl.body.ru}`;
    const doc = await this.documentsService.upload(
      actor,
      {
        buffer: Buffer.from(markdown, 'utf-8'),
        originalName: `${tpl.key}.md`,
        mime: 'text/markdown',
      },
      { link: { entityType: 'policy', entityId: created.id, relation: 'attachment' } },
    );
    await this.addVersion(actor, created.id, {
      documentId: doc.id,
      changelog: `Created from template: ${tpl.key}`,
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'policy.created_from_template',
      entityType: 'policy',
      entityId: created.id,
      after: { template: tpl.key },
    });
    return { id: created.id, template: tpl.key };
  }

  async create(actor: Actor, input: CreatePolicyInput) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      for (const membershipId of [input.ownerMembershipId, input.approverMembershipId]) {
        if (!membershipId) continue;
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(and(eq(membership.id, membershipId), eq(membership.tenantId, actor.tenantId)));
        if (!m) throw new BadRequestException('owner/approver: membership не найден в тенанте');
      }
      const [row] = await tx
        .insert(policy)
        .values({
          tenantId: actor.tenantId,
          titleI18n: input.titleI18n,
          ownerMembershipId: input.ownerMembershipId ?? null,
          approverMembershipId: input.approverMembershipId ?? null,
          renewBy: input.renewBy ? new Date(input.renewBy) : null,
          frameworkIds: input.frameworkIds ?? [],
        })
        .returning();
      if (!row) throw new Error('Политика не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'policy.created',
      entityType: 'policy',
      entityId: created.id,
      after: { title: created.titleI18n.en },
    });
    return created;
  }

  /** Добавить версию (документ-содержимое из T-034); номер версии авто-инкремент. */
  async addVersion(
    actor: Actor,
    policyId: string,
    input: { documentId?: string; changelog?: string },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [pol] = await tx
        .select()
        .from(policy)
        .where(and(eq(policy.id, policyId), isNull(policy.deletedAt)));
      if (!pol) throw new NotFoundException(`Политика ${policyId} не найдена`);
      if (input.documentId) {
        const [doc] = await tx
          .select({ id: document.id })
          .from(document)
          .where(and(eq(document.id, input.documentId), isNull(document.deletedAt)));
        if (!doc) throw new BadRequestException('documentId: документ не найден');
      }
      const maxRows = await tx
        .select({ value: max(policyVersion.version) })
        .from(policyVersion)
        .where(eq(policyVersion.policyId, policyId));
      const maxVersion = maxRows[0]?.value ?? 0;
      const [row] = await tx
        .insert(policyVersion)
        .values({
          policyId,
          version: maxVersion + 1,
          documentId: input.documentId ?? null,
          changelog: input.changelog ?? null,
        })
        .returning();
      if (!row) throw new Error('Версия не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'policy.version_added',
      entityType: 'policy',
      entityId: policyId,
      after: { version: created.version },
    });
    return created;
  }

  /**
   * Workflow политики (T-052, B4): draft→in_review→approved→archived.
   * approve — только назначенный approver; approved фиксирует approved_at/by
   * на последней версии.
   */
  async transition(actor: Actor, id: string, action: 'submit' | 'approve' | 'reject' | 'archive') {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(policy)
        .where(and(eq(policy.id, id), isNull(policy.deletedAt)));
      if (!row) throw new NotFoundException(`Политика ${id} не найдена`);

      const nextStatus = this.nextStatus(row.status, action);
      if (!nextStatus) {
        throw new BadRequestException(`Действие «${action}» недоступно из статуса ${row.status}`);
      }

      // approve/reject — только назначенный approver (проверка по membership юзера)
      if (action === 'approve' || action === 'reject') {
        const [me] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(
            and(eq(membership.userId, actor.userId!), eq(membership.tenantId, actor.tenantId)),
          );
        if (!row.approverMembershipId || me?.id !== row.approverMembershipId) {
          throw new ForbiddenException('Утверждать/отклонять может только назначенный approver');
        }
      }

      await tx.update(policy).set({ status: nextStatus }).where(eq(policy.id, id));

      // approve фиксирует утверждение на последней версии
      if (action === 'approve') {
        const latest = await tx
          .select()
          .from(policyVersion)
          .where(eq(policyVersion.policyId, id))
          .orderBy(desc(policyVersion.version))
          .limit(1);
        if (latest[0]) {
          await tx
            .update(policyVersion)
            .set({ approvedAt: sql`now()`, approvedBy: row.approverMembershipId })
            .where(eq(policyVersion.id, latest[0].id));
        }
      }
      return { before: row.status, after: nextStatus, row };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'policy.status_changed',
      entityType: 'policy',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after, action },
    });
    // T-V19: политика ушла на согласование → уведомить approver'а
    if (action === 'submit' && result.row.approverMembershipId) {
      await this.notificationDispatch.notify({
        tenantId: actor.tenantId,
        recipientMembershipId: result.row.approverMembershipId,
        type: 'action',
        title: `Approval requested: ${result.row.titleI18n.en}`,
        email: {
          template: 'policy-review-request',
          params: { policyTitle: result.row.titleI18n.en },
        },
      });
    }
    return { before: result.before, after: result.after };
  }

  private nextStatus(current: string, action: string): string | null {
    const table: Record<string, Record<string, string>> = {
      draft: { submit: 'in_review', archive: 'archived' },
      in_review: { approve: 'approved', reject: 'draft' },
      approved: { archive: 'archived' },
    };
    return table[current]?.[action] ?? null;
  }

  /** T-V17: membership текущего юзера в тенанте (для очереди approver'а). */
  async membershipOf(userId: string, tenantId: string): Promise<string | undefined> {
    const [m] = await this.dbService.db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.userId, userId), eq(membership.tenantId, tenantId)));
    return m?.id;
  }

  async list(
    tenantId: string,
    locale: Locale,
    filters?: { status?: string; approverMembershipId?: string },
  ) {
    const conds = [isNull(policy.deletedAt)];
    if (filters?.status) conds.push(eq(policy.status, filters.status));
    if (filters?.approverMembershipId) {
      conds.push(eq(policy.approverMembershipId, filters.approverMembershipId));
    }
    const approverMembership = alias(membership, 'approver_membership');
    const approverUser = alias(user, 'approver_user');
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: policy.id,
          titleI18n: policy.titleI18n,
          status: policy.status,
          renewBy: policy.renewBy,
          owner: user.fullName,
          approver: approverUser.fullName,
        })
        .from(policy)
        .leftJoin(membership, eq(policy.ownerMembershipId, membership.id))
        .leftJoin(user, eq(membership.userId, user.id))
        .leftJoin(approverMembership, eq(policy.approverMembershipId, approverMembership.id))
        .leftJoin(approverUser, eq(approverMembership.userId, approverUser.id))
        .where(and(...conds))
        .orderBy(desc(policy.createdAt)),
    );
    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      title: resolveLocalized(row.titleI18n, locale),
      status: row.status,
      renewBy: row.renewBy?.toISOString() ?? null,
      owner: row.owner,
      approver: row.approver,
      // T-V04: вычисляемая просрочка продления (архивные не считаем)
      expired: row.renewBy !== null && row.status !== 'archived' && row.renewBy.getTime() < now,
    }));
  }

  async detail(tenantId: string, id: string, locale: Locale) {
    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(policy)
        .where(and(eq(policy.id, id), isNull(policy.deletedAt)));
      if (!row) throw new NotFoundException(`Политика ${id} не найдена`);
      const versions = await tx
        .select()
        .from(policyVersion)
        .where(eq(policyVersion.policyId, id))
        .orderBy(asc(policyVersion.version));
      // T-V04: имена сторон + резолв фреймворков в названия
      const names = new Map<string, string>();
      for (const mid of [row.ownerMembershipId, row.approverMembershipId]) {
        if (!mid) continue;
        const [m] = await tx
          .select({ fullName: user.fullName })
          .from(membership)
          .innerJoin(user, eq(membership.userId, user.id))
          .where(eq(membership.id, mid));
        if (m) names.set(mid, m.fullName);
      }
      const frameworks =
        row.frameworkIds.length > 0
          ? await tx
              .select({ id: framework.id, nameI18n: framework.nameI18n })
              .from(framework)
              .where(inArray(framework.id, row.frameworkIds))
          : [];
      return { row, versions, names, frameworks };
    });
    return {
      id: data.row.id,
      title: resolveLocalized(data.row.titleI18n, locale),
      status: data.row.status,
      renewBy: data.row.renewBy?.toISOString() ?? null,
      expired:
        data.row.renewBy !== null &&
        data.row.status !== 'archived' &&
        data.row.renewBy.getTime() < Date.now(),
      ownerMembershipId: data.row.ownerMembershipId,
      approverMembershipId: data.row.approverMembershipId,
      owner: data.row.ownerMembershipId
        ? (data.names.get(data.row.ownerMembershipId) ?? null)
        : null,
      approver: data.row.approverMembershipId
        ? (data.names.get(data.row.approverMembershipId) ?? null)
        : null,
      frameworkIds: data.row.frameworkIds,
      frameworks: data.frameworks.map((f) => resolveLocalized(f.nameI18n, locale)),
      versions: data.versions.map((v) => ({
        version: v.version,
        documentId: v.documentId,
        changelog: v.changelog,
        approvedAt: v.approvedAt?.toISOString() ?? null,
      })),
    };
  }
}
