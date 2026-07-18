import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { resolveLocalized } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { control, finding, reportSnapshot, risk } from '../db/schema';

export const EXPORT_ENTITIES = ['findings', 'risks', 'controls'] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export const EXPORT_FORMATS = ['csv', 'xml'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function xmlEscape(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class ReportsExportService {
  constructor(private readonly dbService: DbService) {}

  async export(tenantId: string, entity: string, format: string) {
    if (!(EXPORT_ENTITIES as readonly string[]).includes(entity)) {
      throw new BadRequestException(`entity: ожидается ${EXPORT_ENTITIES.join('|')}`);
    }
    if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
      throw new BadRequestException(`format: ожидается ${EXPORT_FORMATS.join('|')}`);
    }
    const rows = await this.rows(tenantId, entity as ExportEntity);
    const body = format === 'csv' ? this.toCsv(rows) : this.toXml(entity, rows);
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/xml';
    return { body, contentType, filename: `${entity}.${format}` };
  }

  /** Сравнение двух снапшотов (T-099, REP-03): дельта по каждой метрике и breakdown-ключу. */
  async compare(tenantId: string, aId: string, bId: string) {
    const [a, b] = await this.dbService.withTenant(tenantId, async (tx) => {
      const [ra] = await tx.select().from(reportSnapshot).where(and(eq(reportSnapshot.id, aId)));
      const [rb] = await tx.select().from(reportSnapshot).where(and(eq(reportSnapshot.id, bId)));
      return [ra, rb];
    });
    if (!a) throw new NotFoundException(`Снапшот ${aId} не найден`);
    if (!b) throw new NotFoundException(`Снапшот ${bId} не найден`);
    const ma = a.metrics as Record<string, Record<string, number>>;
    const mb = b.metrics as Record<string, Record<string, number>>;
    const metricNames = new Set([...Object.keys(ma), ...Object.keys(mb)]);
    const diff: Record<string, Record<string, { a: number; b: number; delta: number }>> = {};
    for (const m of metricNames) {
      const ka = ma[m] ?? {};
      const kb = mb[m] ?? {};
      const keys = new Set([...Object.keys(ka), ...Object.keys(kb)]);
      diff[m] = {};
      for (const k of keys) {
        const va = ka[k] ?? 0;
        const vb = kb[k] ?? 0;
        diff[m][k] = { a: va, b: vb, delta: vb - va };
      }
    }
    return { a: { id: a.id, label: a.label }, b: { id: b.id, label: b.label }, diff };
  }

  private async rows(tenantId: string, entity: ExportEntity): Promise<Record<string, string>[]> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      if (entity === 'findings') {
        const rs = await tx
          .select({ id: finding.id, titleI18n: finding.titleI18n, riskRating: finding.riskRating, status: finding.status })
          .from(finding)
          .where(isNull(finding.deletedAt));
        return rs.map((r) => ({
          id: r.id,
          title: resolveLocalized(r.titleI18n, 'en'),
          severity: r.riskRating,
          status: r.status,
        }));
      }
      if (entity === 'risks') {
        const rs = await tx
          .select({ id: risk.id, titleI18n: risk.titleI18n, riskClass: risk.riskClass, treatment: risk.treatment, status: risk.status })
          .from(risk)
          .where(isNull(risk.deletedAt));
        return rs.map((r) => ({
          id: r.id,
          title: resolveLocalized(r.titleI18n, 'en'),
          riskClass: r.riskClass ?? '',
          treatment: r.treatment ?? '',
          status: r.status,
        }));
      }
      const rs = await tx
        .select({ id: control.id, ref: control.ref, objectiveI18n: control.objectiveI18n })
        .from(control)
        .where(isNull(control.deletedAt));
      return rs.map((r) => ({ id: r.id, ref: r.ref, objective: resolveLocalized(r.objectiveI18n, 'en') }));
    });
  }

  private toCsv(rows: Record<string, string>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]!);
    const lines = [headers.join(',')];
    for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(','));
    return lines.join('\n');
  }

  private toXml(entity: string, rows: Record<string, string>[]): string {
    const items = rows
      .map((r) => {
        const fields = Object.entries(r)
          .map(([k, v]) => `    <${k}>${xmlEscape(v)}</${k}>`)
          .join('\n');
        return `  <item>\n${fields}\n  </item>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<${entity}>\n${items}\n</${entity}>`;
  }
}
