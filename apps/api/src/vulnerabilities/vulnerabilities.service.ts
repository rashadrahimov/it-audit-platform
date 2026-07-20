import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { asset, vulnerability } from '../db/schema';
import { dueDateFor, SlaConfigService } from '../sla-config/sla-config.service';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** T-V53: фильтры реестра — статус (в т.ч. resolved = история) и severity. */
export interface VulnFilters {
  status?: string;
  severity?: string;
}

/** Lifecycle уязвимости (T-062): open→remediating→resolved. */
const FLOW: Record<string, string[]> = {
  open: ['remediating', 'resolved'],
  remediating: ['resolved', 'open'],
};

/** Худший SLA-статус для агрегата Asset SLA (T-V32). */
const SLA_RANK: Record<string, number> = { overdue: 3, due_soon: 2, ok: 1 };
function worstSla(statuses: string[]): string {
  return statuses.reduce(
    (worst, s) => ((SLA_RANK[s] ?? 0) > (SLA_RANK[worst] ?? 0) ? s : worst),
    'ok',
  );
}

@Injectable()
export class VulnerabilitiesService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly slaConfig: SlaConfigService,
  ) {}

  async create(
    actor: Actor,
    input: {
      title: string;
      cve?: string;
      severity?: string;
      description?: string;
      dueDate?: string;
      assetId?: string;
    },
  ) {
    const severity = input.severity ?? 'medium';
    // T-V32: авто-дедлайн по SLA-окну severity, если due не задан вручную
    const windows = await this.slaConfig.configOf(actor.tenantId);
    const dueDate = input.dueDate ? new Date(input.dueDate) : dueDateFor(windows, severity);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(vulnerability)
        .values({
          tenantId: actor.tenantId,
          title: input.title,
          cve: input.cve ?? null,
          severity,
          description: input.description ?? null,
          dueDate,
          assetId: input.assetId ?? null,
        })
        .returning();
      if (!row) throw new Error('Уязвимость не создалась');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vulnerability.created',
      entityType: 'vulnerability',
      entityId: created.id,
      after: { title: created.title, severity: created.severity },
    });
    return { id: created.id, status: created.status, slaStatus: created.slaStatus };
  }

  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(vulnerability)
        .where(and(eq(vulnerability.id, id), isNull(vulnerability.deletedAt)));
      if (!row) throw new NotFoundException(`Уязвимость ${id} не найдена`);
      if (!FLOW[row.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${row.status} → ${to} недопустим`);
      }
      await tx
        .update(vulnerability)
        .set({ status: to, resolvedAt: to === 'resolved' ? sql`now()` : row.resolvedAt })
        .where(eq(vulnerability.id, id));
      return { before: row.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'vulnerability.status_changed',
      entityType: 'vulnerability',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  async list(tenantId: string, filters?: VulnFilters) {
    // T-V53: resolved-фильтр = «Deactivated/History» — закрытые уязвимости отдельно
    const conds = [isNull(vulnerability.deletedAt)];
    if (filters?.status) conds.push(eq(vulnerability.status, filters.status));
    if (filters?.severity) conds.push(eq(vulnerability.severity, filters.severity));
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: vulnerability.id,
          title: vulnerability.title,
          cve: vulnerability.cve,
          severity: vulnerability.severity,
          status: vulnerability.status,
          slaStatus: vulnerability.slaStatus,
          dueDate: vulnerability.dueDate,
          assetId: vulnerability.assetId,
          assetName: asset.name,
        })
        .from(vulnerability)
        .leftJoin(asset, eq(vulnerability.assetId, asset.id))
        .where(and(...conds))
        .orderBy(desc(vulnerability.createdAt)),
    );
    return rows.map((v) => ({
      id: v.id,
      title: v.title,
      cve: v.cve,
      severity: v.severity,
      status: v.status,
      slaStatus: v.slaStatus,
      dueDate: v.dueDate?.toISOString() ?? null,
      assetId: v.assetId,
      assetName: v.assetName ?? null,
    }));
  }

  /**
   * T-V32: уязвимости, сгруппированные по активу, с агрегатом Asset SLA status
   * (худший SLA среди НЕзакрытых уязвимостей актива). Непривязанные — в bucket assetId=null.
   */
  async byAsset(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: vulnerability.id,
          title: vulnerability.title,
          severity: vulnerability.severity,
          status: vulnerability.status,
          slaStatus: vulnerability.slaStatus,
          dueDate: vulnerability.dueDate,
          assetId: vulnerability.assetId,
          assetName: asset.name,
        })
        .from(vulnerability)
        .leftJoin(asset, eq(vulnerability.assetId, asset.id))
        .where(isNull(vulnerability.deletedAt))
        .orderBy(desc(vulnerability.createdAt)),
    );
    const groups = new Map<
      string,
      {
        assetId: string | null;
        assetName: string | null;
        slaStatus: string;
        open: number;
        total: number;
        vulns: Array<{
          id: string;
          title: string;
          severity: string;
          status: string;
          slaStatus: string;
          dueDate: string | null;
        }>;
      }
    >();
    for (const v of rows) {
      const key = v.assetId ?? '__unassigned__';
      let g = groups.get(key);
      if (!g) {
        g = {
          assetId: v.assetId,
          assetName: v.assetName ?? null,
          slaStatus: 'ok',
          open: 0,
          total: 0,
          vulns: [],
        };
        groups.set(key, g);
      }
      g.total += 1;
      if (v.status !== 'resolved') g.open += 1;
      g.vulns.push({
        id: v.id,
        title: v.title,
        severity: v.severity,
        status: v.status,
        slaStatus: v.slaStatus,
        dueDate: v.dueDate?.toISOString() ?? null,
      });
    }
    // Asset SLA status = худший SLA среди открытых уязвимостей актива
    for (const g of groups.values()) {
      const openSla = g.vulns.filter((v) => v.status !== 'resolved').map((v) => v.slaStatus);
      g.slaStatus = worstSla(openSla);
    }
    // именованные активы сверху, непривязанные — в конец
    return [...groups.values()].sort((a, b) => {
      if (a.assetId === null) return 1;
      if (b.assetId === null) return -1;
      return (a.assetName ?? '').localeCompare(b.assetName ?? '');
    });
  }
}
