import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { ConnectorSyncService } from '../connectors/connector-sync.service';
import { DbService } from '../db/db.service';
import { RbacService } from '../rbac/rbac.service';
import { maskFields } from '../rbac/field-policy';
import { TasksService } from '../tasks/tasks.service';
import { connector, department, membership, personnelProfile, task } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

const EMPLOYMENT_STATUSES = ['active', 'onboarding', 'offboarded'];

/** T-V26: дефолтные чеклисты on/offboarding (создаются при смене статуса). */
const ONBOARDING_TASKS = [
  'Provision accounts and access',
  'Assign security awareness training',
  'Issue and enroll device (MFA)',
  'Sign acceptable use and confidentiality policies',
];
const OFFBOARDING_TASKS = [
  'Revoke all system access',
  'Recover company devices and assets',
  'Disable accounts and rotate shared secrets',
  'Transfer ownership of data and documents',
];

const strField = (r: Record<string, unknown>, keys: string[]): string | null => {
  for (const k of keys) {
    if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  }
  return null;
};

/** Профили персонала (T-069, B6): импорт из personnel-коннектора + ручное заведение. */
@Injectable()
export class PersonnelService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly connectorSyncService: ConnectorSyncService,
    private readonly rbacService: RbacService,
    private readonly tasksService: TasksService,
  ) {}

  /** Импорт профилей из коннектора (personnel capability): records → personnel_profile (upsert по external_id). */
  async importFromConnector(actor: Actor, connectorId: string) {
    const [conn] = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(connector)
        .where(and(eq(connector.id, connectorId), isNull(connector.deletedAt))),
    );
    if (!conn) throw new NotFoundException(`Коннектор ${connectorId} не найден`);
    if (!conn.capabilities.includes('personnel')) {
      throw new BadRequestException('Коннектор не имеет capability «personnel»');
    }

    const { records } = await this.connectorSyncService.collectRecords(actor.tenantId, connectorId);
    let imported = 0;
    let updated = 0;
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      for (const r of records) {
        const externalId = strField(r, ['id', 'dn', 'uid', 'externalId']);
        if (!externalId) continue;
        const fullName = strField(r, ['fullName', 'cn', 'name']) ?? externalId;
        const email = strField(r, ['email', 'mail']);
        const [row] = await tx
          .insert(personnelProfile)
          .values({ tenantId: actor.tenantId, connectorId, externalId, fullName, email })
          .onConflictDoUpdate({
            target: [personnelProfile.connectorId, personnelProfile.externalId],
            set: { fullName, email },
          })
          .returning({
            createdAt: personnelProfile.createdAt,
            updatedAt: personnelProfile.updatedAt,
          });
        // новый, если created==updated (только что вставлен)
        if (row && row.createdAt.getTime() === row.updatedAt.getTime()) imported += 1;
        else updated += 1;
      }
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'personnel.imported',
      entityType: 'connector',
      entityId: connectorId,
      after: { imported, updated },
    });
    return { imported, updated };
  }

  async createManual(
    actor: Actor,
    input: {
      fullName: string;
      email?: string;
      departmentId?: string;
      membershipId?: string;
      unit?: string;
      position?: string;
      employmentStatus?: string;
      certificates?: unknown[];
      contacts?: Record<string, unknown>;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(personnelProfile)
        .values({
          tenantId: actor.tenantId,
          fullName: input.fullName,
          email: input.email ?? null,
          departmentId: input.departmentId ?? null,
          membershipId: input.membershipId ?? null,
          unit: input.unit ?? null,
          position: input.position ?? null,
          employmentStatus: input.employmentStatus ?? 'active',
          certificates: input.certificates ?? [],
          contacts: input.contacts ?? {},
        })
        .returning();
      if (!row) throw new Error('Профиль не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'personnel.created',
      entityType: 'personnel_profile',
      entityId: created.id,
      after: { fullName: created.fullName },
    });
    return { id: created.id, employmentStatus: created.employmentStatus };
  }

  /** Смена статуса занятости (onboarding→active→offboarded). */
  async setStatus(actor: Actor, id: string, status: string) {
    if (!EMPLOYMENT_STATUSES.includes(status)) {
      throw new BadRequestException(`Недопустимый статус: ${status}`);
    }
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          status: personnelProfile.employmentStatus,
          membershipId: personnelProfile.membershipId,
        })
        .from(personnelProfile)
        .where(and(eq(personnelProfile.id, id), isNull(personnelProfile.deletedAt)));
      if (!row) throw new NotFoundException(`Профиль ${id} не найден`);
      await tx
        .update(personnelProfile)
        .set({ employmentStatus: status })
        .where(eq(personnelProfile.id, id));

      // T-V26: сеем чеклист фазы, если его ещё нет (сравнение по титулам —
      // onboarding и offboarding живут независимо на одном профиле)
      let seeded = 0;
      let membershipDeactivated = false;
      if (status === 'onboarding' || status === 'offboarded') {
        const checklist = status === 'onboarding' ? ONBOARDING_TASKS : OFFBOARDING_TASKS;
        const existing = await tx
          .select({ title: task.title })
          .from(task)
          .where(
            and(
              eq(task.entityType, 'personnel'),
              eq(task.entityId, id),
              inArray(task.title, checklist),
            ),
          );
        if (existing.length === 0) {
          const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 дней
          seeded = await this.tasksService.seedForEntity(
            tx,
            actor.tenantId,
            'personnel',
            id,
            checklist,
            due,
          );
        }
      }
      // T-V26: offboarded → авто-деактивация связанной membership
      if (status === 'offboarded' && row.membershipId) {
        // membership над-тенантная (без RLS) — читаем/пишем под tenant-условием явно
        const [m] = await tx
          .select({ id: membership.id })
          .from(membership)
          .where(and(eq(membership.id, row.membershipId), eq(membership.tenantId, actor.tenantId)));
        if (m) {
          await tx
            .update(membership)
            .set({ status: 'inactive' })
            .where(eq(membership.id, row.membershipId));
          membershipDeactivated = true;
        }
      }
      return { before: row.status, after: status, seeded, membershipDeactivated };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'personnel.status_changed',
      entityType: 'personnel_profile',
      entityId: id,
      before: { status: result.before },
      after: {
        status: result.after,
        tasksSeeded: result.seeded,
        membershipDeactivated: result.membershipDeactivated,
      },
    });
    return result;
  }

  async list(
    tenantId: string,
    userId: string,
    filters?: { employmentStatus?: string; departmentId?: string },
  ) {
    const conds = [isNull(personnelProfile.deletedAt)];
    if (filters?.employmentStatus) {
      conds.push(eq(personnelProfile.employmentStatus, filters.employmentStatus));
    }
    if (filters?.departmentId) {
      conds.push(eq(personnelProfile.departmentId, filters.departmentId));
    }
    const { rows, taskRows } = await this.dbService.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(personnelProfile)
        .where(and(...conds))
        .orderBy(desc(personnelProfile.createdAt));
      const ids = rows.map((r) => r.id);
      // T-V26: задачи всех профилей одним запросом (для сводки Task status)
      const taskRows = ids.length
        ? await tx
            .select({ entityId: task.entityId, status: task.status, dueDate: task.dueDate })
            .from(task)
            .where(and(eq(task.entityType, 'personnel'), inArray(task.entityId, ids)))
        : [];
      return { rows, taskRows };
    });
    const now = new Date();
    const tasksByProfile = new Map<string, Array<{ status: string; dueDate: Date | null }>>();
    for (const tr of taskRows) {
      const list = tasksByProfile.get(tr.entityId) ?? [];
      list.push({ status: tr.status, dueDate: tr.dueDate });
      tasksByProfile.set(tr.entityId, list);
    }
    // SEC-04 (ADR-0020): field-level маскирование по роли (эталон: email персонала)
    const levels = await this.rbacService.fieldLevels(userId, tenantId, 'personnel');
    return rows.map((p) =>
      maskFields(
        {
          id: p.id,
          fullName: p.fullName,
          email: p.email,
          unit: p.unit,
          position: p.position,
          employmentStatus: p.employmentStatus,
          departmentId: p.departmentId,
          fromConnector: p.connectorId !== null,
          taskSummary: this.tasksService.summarize(tasksByProfile.get(p.id) ?? [], now),
        },
        levels,
      ),
    );
  }

  // === T-V26: департаменты (Groups) — CRUD ===

  async listDepartments(tenantId: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(department).orderBy(desc(department.createdAt));
      // счётчик сотрудников на департамент
      const counts = await tx
        .select({ departmentId: personnelProfile.departmentId })
        .from(personnelProfile)
        .where(isNull(personnelProfile.deletedAt));
      const byDept = new Map<string, number>();
      for (const c of counts) {
        if (c.departmentId) byDept.set(c.departmentId, (byDept.get(c.departmentId) ?? 0) + 1);
      }
      return rows.map((d) => ({ id: d.id, nameI18n: d.nameI18n, people: byDept.get(d.id) ?? 0 }));
    });
  }

  async createDepartment(actor: Actor, name: string) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(department)
        .values({ tenantId: actor.tenantId, nameI18n: { en: name } })
        .returning();
      return row!;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'department.created',
      entityType: 'department',
      entityId: created.id,
      after: { name },
    });
    return { id: created.id };
  }

  async renameDepartment(actor: Actor, id: string, name: string) {
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: department.id })
        .from(department)
        .where(eq(department.id, id));
      if (!row) throw new NotFoundException(`Департамент ${id} не найден`);
      await tx
        .update(department)
        .set({ nameI18n: { en: name } })
        .where(eq(department.id, id));
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'department.renamed',
      entityType: 'department',
      entityId: id,
      after: { name },
    });
    return { id };
  }

  async deleteDepartment(actor: Actor, id: string) {
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: department.id })
        .from(department)
        .where(eq(department.id, id));
      if (!row) throw new NotFoundException(`Департамент ${id} не найден`);
      // отвязать сотрудников, затем удалить
      await tx
        .update(personnelProfile)
        .set({ departmentId: null })
        .where(eq(personnelProfile.departmentId, id));
      await tx.delete(department).where(eq(department.id, id));
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'department.deleted',
      entityType: 'department',
      entityId: id,
    });
    return { deleted: true };
  }
}
