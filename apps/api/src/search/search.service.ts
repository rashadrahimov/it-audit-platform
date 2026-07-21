import { BadRequestException, Injectable } from '@nestjs/common';
import { and, ilike, isNull, or, sql } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { auditProgram, checklistItem, control, finding, kbEntry, workingPaper } from '../db/schema';

const PER_TYPE = 5;

export interface SearchHit {
  type: string;
  id: string;
  label: string;
  snippet?: string;
}

export interface AuditQueryHit {
  id: string;
  title: string;
  riskRating: string;
  status: string;
  engagementId: string | null;
  controlRef: string | null;
  checklistRef: string | null;
  snippet: string;
  reason: string;
}

const RISK_ALIASES: Array<[string, string[]]> = [
  ['critical', ['critical', 'критич', 'kritik']],
  ['high', ['high', 'высок', 'yüksək']],
  ['medium', ['medium', 'средн', 'orta']],
  ['low', ['low', 'низк', 'aşağı']],
];

const STATUS_ALIASES: Array<[string, string[]]> = [
  ['identified', ['identified', 'выявлен', 'aşkarlan']],
  ['assigned', ['assigned', 'назнач', 'təyin']],
  ['in_progress', ['in progress', 'in_progress', 'работ', 'icra']],
  ['remediated', ['remediated', 'устран', 'aradan']],
  ['pending_retest', ['pending retest', 'pending_retest', 'ре-тест', 'təkrar']],
  ['closed', ['closed', 'закрыт', 'bağlan']],
];

const TOPIC_ALIASES: Array<[string, string[]]> = [
  [
    'access control',
    [
      'access',
      'user',
      'account',
      'mfa',
      'privilege',
      'identity',
      'iam',
      'доступ',
      'учет',
      'учёт',
      'пользовател',
      'giriş',
      'hesab',
      'istifadəçi',
    ],
  ],
  ['backup and recovery', ['backup', 'restore', 'recovery', 'резерв', 'восстанов', 'bərpa']],
  ['incident response', ['incident', 'alert', 'siem', 'инцидент', 'hadisə', 'insident']],
  [
    'third-party risk',
    ['vendor', 'supplier', 'third', 'outsourc', 'вендор', 'поставщик', 'təchizatçı'],
  ],
  ['change management', ['change', 'release', 'deployment', 'изменен', 'релиз', 'dəyişiklik']],
  ['logging and monitoring', ['log', 'monitor', 'журнал', 'лог', 'monitorinq']],
  ['policy governance', ['policy', 'procedure', 'политик', 'процедур', 'siyasət']],
];

const STOP_WORDS = new Set([
  'show',
  'all',
  'me',
  'find',
  'finding',
  'findings',
  'related',
  'relating',
  'to',
  'with',
  'about',
  'open',
  'control',
  'controls',
  'открой',
  'покажи',
  'найди',
  'все',
  'замечания',
  'находки',
  'контроль',
  'контроли',
  'по',
  'про',
  'ilə',
  'üzrə',
  'nəzarət',
  'hamısı',
  'tap',
  'göstər',
]);

function textOf(value: I18nText | null | undefined, locale: Locale): string {
  return value ? resolveLocalized(value, locale) : '';
}

function includesAny(text: string, aliases: string[]): boolean {
  return aliases.some((a) => text.includes(a));
}

function parseAuditQuery(raw: string) {
  const query = raw.trim();
  const lower = query.toLowerCase();
  const riskRating = RISK_ALIASES.find(([, aliases]) => includesAny(lower, aliases))?.[0];
  const status = STATUS_ALIASES.find(([, aliases]) => includesAny(lower, aliases))?.[0];
  const topic = TOPIC_ALIASES.find(
    ([name, aliases]) => lower.includes(name) || includesAny(lower, aliases),
  );
  const topicTerms = topic?.[1] ?? [];
  const explicitTerms = lower
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
    .filter((term) => !RISK_ALIASES.some(([, aliases]) => aliases.some((a) => term.includes(a))))
    .filter((term) => !STATUS_ALIASES.some(([, aliases]) => aliases.some((a) => term.includes(a))))
    .filter((term) => !topicTerms.includes(term))
    .slice(0, 6);
  return { query, riskRating, status, topic: topic?.[0] ?? null, topicTerms, explicitTerms };
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

  /** T-H38: deterministic conversational audit query over findings; no unsupported LLM claims. */
  async askFindings(tenantId: string, q: string, locale: Locale) {
    const parsed = parseAuditQuery(q);
    if (!parsed.query) throw new BadRequestException('Нужен непустой параметр q');

    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: finding.id,
          titleI18n: finding.titleI18n,
          descriptionI18n: finding.descriptionI18n,
          recommendationI18n: finding.recommendationI18n,
          riskRating: finding.riskRating,
          status: finding.status,
          engagementId: finding.engagementId,
          checklistRef: checklistItem.ref,
          checklistQuestionI18n: checklistItem.questionI18n,
          controlRef: control.ref,
          controlObjectiveI18n: control.objectiveI18n,
        })
        .from(finding)
        .leftJoin(checklistItem, sql`${finding.checklistItemId} = ${checklistItem.id}`)
        .leftJoin(control, sql`${finding.controlId} = ${control.id}`)
        .where(isNull(finding.deletedAt))
        .orderBy(
          sql`
          case ${finding.riskRating}
            when 'critical' then 1
            when 'high' then 2
            when 'medium' then 3
            when 'low' then 4
            else 5
          end,
          ${finding.createdAt} desc
        `,
        )
        .limit(200),
    );

    const hits: AuditQueryHit[] = [];
    for (const row of rows) {
      const title = textOf(row.titleI18n, locale);
      const description = textOf(row.descriptionI18n, locale);
      const recommendation = textOf(row.recommendationI18n, locale);
      const checklistQuestion = textOf(row.checklistQuestionI18n, locale);
      const controlObjective = textOf(row.controlObjectiveI18n, locale);
      const haystack = [
        title,
        description,
        recommendation,
        row.riskRating,
        row.status,
        row.checklistRef,
        row.controlRef,
        checklistQuestion,
        controlObjective,
      ]
        .join(' ')
        .toLowerCase();

      if (parsed.riskRating && row.riskRating !== parsed.riskRating) continue;
      if (parsed.status && row.status !== parsed.status) continue;
      if (parsed.topicTerms.length > 0 && !includesAny(haystack, parsed.topicTerms)) continue;
      if (
        parsed.explicitTerms.length > 0 &&
        !parsed.explicitTerms.every((t) => haystack.includes(t))
      ) {
        continue;
      }

      const reasons = [
        parsed.riskRating ? `${parsed.riskRating} risk` : null,
        parsed.status ? `status ${parsed.status}` : null,
        parsed.topic ? `topic ${parsed.topic}` : null,
      ].filter(Boolean);
      hits.push({
        id: row.id,
        title,
        riskRating: row.riskRating,
        status: row.status,
        engagementId: row.engagementId,
        controlRef: row.controlRef,
        checklistRef: row.checklistRef,
        snippet: description || recommendation || checklistQuestion || controlObjective,
        reason: reasons.length > 0 ? reasons.join(' · ') : 'matched query terms',
      });
      if (hits.length >= 20) break;
    }

    return {
      query: parsed.query,
      interpreted: {
        intent: 'findings_lookup',
        riskRating: parsed.riskRating ?? null,
        status: parsed.status ?? null,
        topic: parsed.topic,
        terms: parsed.explicitTerms,
      },
      answer:
        hits.length === 0
          ? 'No matching findings were found in the current tenant.'
          : `Found ${hits.length} matching finding${hits.length === 1 ? '' : 's'}.`,
      count: hits.length,
      hits,
    };
  }
}
