import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { AuditLogService } from '../src/audit/audit-log.service';
import { DbService } from '../src/db/db.service';
import { IncidentsService } from '../src/incidents/incidents.service';
import { SlaConfigService } from '../src/sla-config/sla-config.service';
import {
  auditLog,
  incident,
  incidentEvent,
  membership,
  role,
  tenant,
  user,
} from '../src/db/schema';

/**
 * DoD T-IR01 (EP-INC, ADR-0024): инцидент создаётся с номером INC-NNNN, проходит все
 * фазы реагирования, каждый переход механически ложится в таймлайн; недопустимый переход
 * отбивается; дедлайн резолюции считается от момента обнаружения по окну severity.
 * Интеграционный: инфра + миграции (0075) + `pnpm seed` (нужны пресет-роли).
 */
const run = Date.now();
const emails = {
  admin: `inc-admin-${run}@t.io`,
  commander: `inc-cmd-${run}@t.io`,
};

const dbService = new DbService();
const service = new IncidentsService(
  dbService,
  new AuditLogService(dbService),
  new SlaConfigService(dbService),
);

let tenantId: string;
let commanderMembershipId: string;
let incidentId: string;
const uid: Record<string, string> = {};

const actor = (key: keyof typeof emails) => ({ tenantId, userId: uid[key]!, ip: '::1' });

async function presetRoleId(nameEn: string): Promise<string> {
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const found = roles.find((r) => r.nameI18n.en === nameEn);
  if (!found) throw new Error(`Нет пресета ${nameEn} — прогнать pnpm seed`);
  return found.id;
}

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug: `incident-${run}`, name: 'Incident T' })
    .returning();
  tenantId = t!.id;
  const users = await dbService.db
    .insert(user)
    .values(Object.values(emails).map((email) => ({ email, fullName: email, passwordHash: 'x' })))
    .returning();
  (Object.keys(emails) as (keyof typeof emails)[]).forEach((k, i) => (uid[k] = users[i]!.id));
  const adminRole = await presetRoleId('Admin');
  const memberships = await dbService.db
    .insert(membership)
    .values([
      { userId: uid.admin!, tenantId, roleId: adminRole, category: 'auditor' },
      { userId: uid.commander!, tenantId, roleId: adminRole, category: 'auditor' },
    ])
    .returning();
  commanderMembershipId = memberships[1]!.id;
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(incidentEvent).where(eq(incidentEvent.tenantId, tenantId));
    await tx.delete(incident).where(eq(incident.tenantId, tenantId));
    // audit_log append-only (T-021) — записи теста остаются, как и в других спеках
  });
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  for (const email of Object.values(emails)) {
    await dbService.db.delete(user).where(eq(user.email, email));
  }
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('Incident management — ядро (T-IR01)', () => {
  it('инцидент создаётся: INC-0001, статус detected, дедлайн по окну severity', async () => {
    // Обнаружен 10 дней назад — дедлайн должен считаться от обнаружения, а не от заведения
    const detectedAt = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const created = await service.create(actor('admin'), {
      title: 'Фишинговая рассылка на финдиректора',
      description: 'Три письма с поддельного домена',
      severity: 'high',
      category: 'phishing',
      detectedAt: detectedAt.toISOString(),
      commanderMembershipId,
    });
    incidentId = created.id;
    expect(created.ref).toBe('INC-0001');
    expect(created.status).toBe('detected');
    // high = 30 дней от обнаружения → дедлайн примерно через 20 дней от сегодня
    const due = new Date(created.dueDate!);
    const daysFromDetected = Math.round((due.getTime() - detectedAt.getTime()) / 86_400_000);
    expect(daysFromDetected).toBe(30);
  });

  it('создание сразу пишет первую запись таймлайна', async () => {
    const detail = await service.detail(tenantId, incidentId);
    expect(detail.timeline).toHaveLength(1);
    expect(detail.timeline[0]!.toStatus).toBe('detected');
    expect(detail.commanderName).toBe(emails.commander);
    expect(detail.allowedTransitions).toEqual(['triaged', 'closed']);
  });

  it('номера сквозные по тенанту: второй инцидент — INC-0002', async () => {
    const second = await service.create(actor('admin'), { title: 'Второй', severity: 'low' });
    expect(second.ref).toBe('INC-0002');
  });

  it('перескок через фазу → 400', async () => {
    await expect(service.transition(actor('admin'), incidentId, 'recovered')).rejects.toThrow(
      /недопустим/,
    );
  });

  it('мусорный статус → 400', async () => {
    await expect(service.transition(actor('admin'), incidentId, 'resolved')).rejects.toThrow(
      /Неизвестный статус/,
    );
  });

  it('проходит все фазы, каждая пишет событие и метку времени', async () => {
    for (const to of ['triaged', 'contained', 'eradicated', 'recovered'] as const) {
      const res = await service.transition(actor('admin'), incidentId, to, `фаза ${to}`);
      expect(res.after).toBe(to);
    }
    const detail = await service.detail(tenantId, incidentId);
    expect(detail.status).toBe('recovered');
    expect(detail.phases.triagedAt).not.toBeNull();
    expect(detail.phases.containedAt).not.toBeNull();
    expect(detail.phases.eradicatedAt).not.toBeNull();
    expect(detail.phases.recoveredAt).not.toBeNull();
    expect(detail.phases.closedAt).toBeNull();
    // 1 создание + 4 перехода
    expect(detail.timeline).toHaveLength(5);
    expect(detail.timeline.map((e) => e.toStatus)).toEqual([
      'detected',
      'triaged',
      'contained',
      'eradicated',
      'recovered',
    ]);
  });

  it('ручная заметка ложится в таймлайн без смены статуса', async () => {
    await service.addEvent(actor('commander'), incidentId, 'action', 'Сброшены пароли 12 учёток');
    const detail = await service.detail(tenantId, incidentId);
    expect(detail.status).toBe('recovered');
    const last = detail.timeline.at(-1)!;
    expect(last.kind).toBe('action');
    expect(last.note).toBe('Сброшены пароли 12 учёток');
    expect(last.authorName).toBe(emails.commander);
  });

  it('смена severity пересчитывает дедлайн резолюции', async () => {
    await service.update(actor('admin'), incidentId, { severity: 'critical' });
    const detail = await service.detail(tenantId, incidentId);
    expect(detail.severity).toBe('critical');
    const due = new Date(detail.dueDate!);
    const detected = new Date(detail.detectedAt);
    // critical = 7 дней от обнаружения
    expect(Math.round((due.getTime() - detected.getTime()) / 86_400_000)).toBe(7);
  });

  it('commander из чужого тенанта → 400', async () => {
    await expect(
      service.update(actor('admin'), incidentId, {
        commanderMembershipId: '11111111-1111-7111-8111-111111111111',
      }),
    ).rejects.toThrow(/Membership/);
  });

  it('фильтры списка: по статусу и severity', async () => {
    const all = await service.list(tenantId);
    expect(all).toHaveLength(2);
    const recovered = await service.list(tenantId, { status: 'recovered' });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.ref).toBe('INC-0001');
    const low = await service.list(tenantId, { severity: 'low' });
    expect(low).toHaveLength(1);
    expect(low[0]!.ref).toBe('INC-0002');
  });

  it('закрытие: метка closedAt, SLA гаснет, переходов больше нет', async () => {
    await service.transition(actor('admin'), incidentId, 'closed', 'Восстановлено, урок учтён');
    const detail = await service.detail(tenantId, incidentId);
    expect(detail.status).toBe('closed');
    expect(detail.phases.closedAt).not.toBeNull();
    expect(detail.slaStatus).toBe('ok');
    expect(detail.allowedTransitions).toEqual([]);
    await expect(service.transition(actor('admin'), incidentId, 'closed')).rejects.toThrow(
      /недопустим/,
    );
  });

  it('жизненный цикл записан в audit_log', async () => {
    const rows = await dbService.withTenant(tenantId, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.entityId, incidentId)),
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('incident.created');
    expect(actions.filter((a) => a === 'incident.status_changed')).toHaveLength(5);
  });

  it('несуществующий инцидент → 404', async () => {
    await expect(service.detail(tenantId, '11111111-1111-7111-8111-111111111111')).rejects.toThrow(
      /не найден/,
    );
  });
});
