import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { AuditLogService } from '../src/audit/audit-log.service';
import { DbService } from '../src/db/db.service';
import { FindingsService } from '../src/findings/findings.service';
import { IncidentsService } from '../src/incidents/incidents.service';
import { SecurityAlertsService } from '../src/security-alerts/security-alerts.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { DEFAULT_SLA_WINDOWS, SlaConfigService } from '../src/sla-config/sla-config.service';
import {
  asset,
  incident,
  incidentEvent,
  incidentLink,
  membership,
  risk,
  role,
  securityAlert,
  tenant,
  user,
} from '../src/db/schema';

/**
 * DoD T-IR02 (EP-INC, ADR-0024): связи инцидента с сущностями платформы и эскалация
 * алерта в инцидент (алерт = сигнал, инцидент = разбирательство; данные связываются,
 * а не дублируются). Интеграционный: инфра + миграции (0076) + `pnpm seed`.
 */
const run = Date.now();
const emails = { admin: `inc-link-${run}@t.io` };

const dbService = new DbService();

/** FindingsService для follow-up (T-IR04): реальны только db/audit/sla — остальное не задействовано. */
const findingsService = (db: DbService) =>
  new FindingsService(
    db,
    new AuditLogService(db),
    {} as never,
    { fieldLevels: async () => ({}) } as never,
    {} as never,
    { configOf: async () => DEFAULT_SLA_WINDOWS } as never,
  );
const incidents = new IncidentsService(
  dbService,
  new AuditLogService(dbService),
  new SlaConfigService(dbService),
  new NotificationsService(dbService),
  findingsService(dbService),
);
const alerts = new SecurityAlertsService(
  dbService,
  new AuditLogService(dbService),
  new SlaConfigService(dbService),
  incidents,
);

let tenantId: string;
let assetId: string;
let riskId: string;
let alertId: string;
let incidentId: string;
let linkId: string;
const uid: Record<string, string> = {};

const actor = () => ({ tenantId, userId: uid.admin!, ip: '::1' });

beforeAll(async () => {
  const [t] = await dbService.db
    .insert(tenant)
    .values({ slug: `inc-link-${run}`, name: 'Incident Links T' })
    .returning();
  tenantId = t!.id;
  const [u] = await dbService.db
    .insert(user)
    .values({ email: emails.admin, fullName: 'Link Admin', passwordHash: 'x' })
    .returning();
  uid.admin = u!.id;
  const roles = await dbService.db.select().from(role).where(eq(role.isSystem, true));
  const adminRole = roles.find((r) => r.nameI18n.en === 'Admin');
  if (!adminRole) throw new Error('Нет пресета Admin — прогнать pnpm seed');
  await dbService.db
    .insert(membership)
    .values({ userId: uid.admin, tenantId, roleId: adminRole.id, category: 'auditor' });

  await dbService.withTenant(tenantId, async (tx) => {
    const [a] = await tx
      .insert(asset)
      .values({ tenantId, name: 'CRM-прод', type: 'system' })
      .returning();
    assetId = a!.id;
    const [r] = await tx
      .insert(risk)
      .values({ tenantId, titleI18n: { en: 'Data leak', ru: 'Утечка данных' } })
      .returning();
    riskId = r!.id;
  });

  const alert = await alerts.create(actor(), {
    title: 'Аномальный доступ к БД CRM',
    severity: 'high',
    category: 'unauthorized_access',
    assetId,
  });
  alertId = alert.id;
});

afterAll(async () => {
  await dbService.withTenant(tenantId, async (tx) => {
    await tx.delete(incidentLink).where(eq(incidentLink.tenantId, tenantId));
    await tx.delete(incidentEvent).where(eq(incidentEvent.tenantId, tenantId));
    await tx.delete(incident).where(eq(incident.tenantId, tenantId));
    await tx.delete(securityAlert).where(eq(securityAlert.tenantId, tenantId));
    await tx.delete(risk).where(eq(risk.tenantId, tenantId));
    await tx.delete(asset).where(eq(asset.tenantId, tenantId));
  });
  await dbService.db.delete(membership).where(eq(membership.tenantId, tenantId));
  await dbService.db.delete(user).where(eq(user.email, emails.admin));
  await dbService.db.delete(tenant).where(eq(tenant.id, tenantId));
  await dbService.onModuleDestroy();
});

describe('Связи инцидента и эскалация алерта (T-IR02)', () => {
  it('эскалация алерта рождает связанный инцидент и триажит сам алерт', async () => {
    const res = await alerts.escalate(actor(), alertId, { note: 'Подтверждён доступ извне' });
    incidentId = res.incidentId;
    expect(res.ref).toBe('INC-0001');
    expect(res.severity).toBe('high');

    const detail = await incidents.detail(tenantId, incidentId);
    expect(detail.source).toBe('alert');
    expect(detail.category).toBe('unauthorized_access');
    expect(detail.links).toHaveLength(1);
    expect(detail.links[0]!.entityType).toBe('security_alert');
    expect(detail.links[0]!.title).toBe('Аномальный доступ к БД CRM');

    const list = await alerts.list(tenantId);
    expect(list.find((a) => a.id === alertId)!.status).toBe('triaged');
  });

  it('повторная эскалация того же алерта → 400 с номером инцидента', async () => {
    await expect(alerts.escalate(actor(), alertId)).rejects.toThrow(/уже эскалирован в инцидент/);
  });

  it('связывает актив и риск, заголовки резолвятся (риск — по локали)', async () => {
    const linked = await incidents.addLink(actor(), incidentId, 'asset', assetId);
    expect(linked.linked).toBe(true);
    linkId = linked.linkId;
    await incidents.addLink(actor(), incidentId, 'risk', riskId);

    const ru = await incidents.detail(tenantId, incidentId, 'ru');
    const byType = Object.fromEntries(ru.links.map((l) => [l.entityType, l.title]));
    expect(byType.asset).toBe('CRM-прод');
    expect(byType.risk).toBe('Утечка данных');
    const en = await incidents.detail(tenantId, incidentId, 'en');
    expect(en.links.find((l) => l.entityType === 'risk')!.title).toBe('Data leak');
  });

  it('повторная связь той же пары не дублируется', async () => {
    const again = await incidents.addLink(actor(), incidentId, 'asset', assetId);
    expect(again.linked).toBe(false);
    const detail = await incidents.detail(tenantId, incidentId);
    expect(detail.links.filter((l) => l.entityType === 'asset')).toHaveLength(1);
  });

  it('связь с несуществующей сущностью → 400', async () => {
    await expect(
      incidents.addLink(actor(), incidentId, 'vendor', '11111111-1111-7111-8111-111111111111'),
    ).rejects.toThrow(/не найден в тенанте/);
  });

  it('каждая связь оставляет след в таймлайне', async () => {
    const detail = await incidents.detail(tenantId, incidentId);
    const linkEvents = detail.timeline.filter((e) => e.note?.startsWith('Связано:'));
    expect(linkEvents.map((e) => e.note)).toEqual([
      'Связано: security_alert',
      'Связано: asset',
      'Связано: risk',
    ]);
  });

  it('связь снимается', async () => {
    await incidents.removeLink(actor(), incidentId, linkId);
    const detail = await incidents.detail(tenantId, incidentId);
    expect(detail.links.map((l) => l.entityType)).toEqual(['security_alert', 'risk']);
    await expect(incidents.removeLink(actor(), incidentId, linkId)).rejects.toThrow(/не найдена/);
  });
});
