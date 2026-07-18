import { BadRequestException, Injectable } from '@nestjs/common';
import { and, ilike, isNull, or, sql } from 'drizzle-orm';
import { resolveLocalized } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { auditProgram, control, finding, kbEntry, workingPaper } from '../db/schema';

const PER_TYPE = 5;

export interface SearchHit {
  type: string;
  id: string;
  label: string;
  snippet?: string;
}

/** Глобальный кросс-сущностный поиск (T-094, GEN-05). RLS изолирует по тенанту. */
@Injectable()
export class SearchService {
  constructor(private readonly dbService: DbService) {}

  async search(tenantId: string, q: string): Promise<{ query: string; hits: SearchHit[] }> {
    const term = q.trim();
    if (!term) throw new BadRequestException('Нужен непустой параметр q');
    const like = `%${term}%`;

    const hits = await this.dbService.withTenant(tenantId, async (tx) => {
      const out: SearchHit[] = [];

      const findings = await tx
        .select({ id: finding.id, titleI18n: finding.titleI18n })
        .from(finding)
        .where(
          and(
            isNull(finding.deletedAt),
            or(
              sql`${finding.titleI18n}::text ILIKE ${like}`,
              sql`${finding.descriptionI18n}::text ILIKE ${like}`,
            ),
          ),
        )
        .limit(PER_TYPE);
      for (const f of findings) {
        out.push({ type: 'finding', id: f.id, label: resolveLocalized(f.titleI18n, 'en') });
      }

      const controls = await tx
        .select({ id: control.id, ref: control.ref, objectiveI18n: control.objectiveI18n })
        .from(control)
        .where(
          and(
            isNull(control.deletedAt),
            or(ilike(control.ref, like), sql`${control.objectiveI18n}::text ILIKE ${like}`),
          ),
        )
        .limit(PER_TYPE);
      for (const c of controls) {
        out.push({
          type: 'control',
          id: c.id,
          label: c.ref,
          snippet: resolveLocalized(c.objectiveI18n, 'en'),
        });
      }

      const wps = await tx
        .select({ id: workingPaper.id, title: workingPaper.title })
        .from(workingPaper)
        .where(and(isNull(workingPaper.deletedAt), ilike(workingPaper.title, like)))
        .limit(PER_TYPE);
      for (const w of wps) out.push({ type: 'working_paper', id: w.id, label: w.title });

      const kbs = await tx
        .select({ id: kbEntry.id, question: kbEntry.question, answer: kbEntry.answer })
        .from(kbEntry)
        .where(
          and(
            isNull(kbEntry.deletedAt),
            or(ilike(kbEntry.question, like), ilike(kbEntry.answer, like)),
          ),
        )
        .limit(PER_TYPE);
      for (const k of kbs)
        out.push({ type: 'kb_entry', id: k.id, label: k.question, snippet: k.answer });

      const programs = await tx
        .select({ id: auditProgram.id, titleI18n: auditProgram.titleI18n })
        .from(auditProgram)
        .where(
          and(isNull(auditProgram.deletedAt), sql`${auditProgram.titleI18n}::text ILIKE ${like}`),
        )
        .limit(PER_TYPE);
      for (const p of programs) {
        out.push({ type: 'audit_program', id: p.id, label: resolveLocalized(p.titleI18n, 'en') });
      }

      return out;
    });

    return { query: term, hits };
  }
}
