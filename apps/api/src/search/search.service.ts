import { BadRequestException, Injectable } from '@nestjs/common';
import { and, ilike, isNull, or, sql } from 'drizzle-orm';
import { resolveLocalized, type I18nText, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import {
  auditProgram,
  checklistItem,
  control,
  document,
  documentLink,
  finding,
  kbEntry,
  workingPaper,
} from '../db/schema';

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
  slaStatus: string;
  dueDate: string | null;
  engagementId: string | null;
  controlRef: string | null;
  checklistRef: string | null;
  snippet: string;
  reason: string;
}

export interface AuditQueryEvidenceHit {
  id: string;
  filename: string;
  status: string;
  category: string | null;
  mime: string;
  entityType: string | null;
  entityId: string | null;
  relation: string | null;
  reviewStatus: string | null;
  reason: string;
}

export interface AuditQueryEvidenceCandidate {
  id: string;
  filename: string;
  status: string;
  category: string | null;
  mime: string;
  entityType: string | null;
  entityId: string | null;
  relation: string | null;
  reviewStatus: string | null;
}

export interface AuditQueryFindingCandidate {
  id: string;
  titleI18n: I18nText;
  descriptionI18n: I18nText | null;
  recommendationI18n: I18nText | null;
  riskRating: string;
  status: string;
  slaStatus: string;
  dueDate: Date | null;
  engagementId: string | null;
  checklistRef: string | null;
  checklistQuestionI18n: I18nText | null;
  controlRef: string | null;
  controlObjectiveI18n: I18nText | null;
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

const SLA_ALIASES: Array<[string, string[]]> = [
  ['overdue', ['overdue', 'past due', 'late', 'просроч', 'опозд', 'gecik', 'vaxtı keç']],
  ['due_soon', ['due soon', 'due_soon', 'скоро срок', 'скоро дедлайн', 'yaxınlaşır']],
  ['ok', ['on track', 'on_track', 'в срок', 'qrafikdə']],
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
  'overdue',
  'late',
  'past',
  'due',
  'sla',
  'control',
  'controls',
  'открой',
  'покажи',
  'найди',
  'все',
  'замечания',
  'находки',
  'просроченные',
  'просрочено',
  'срок',
  'дедлайн',
  'контроль',
  'контроли',
  'по',
  'про',
  'ilə',
  'üzrə',
  'nəzarət',
  'hamısı',
  'gecikmiş',
  'gecikib',
  'qeyd',
  'qeydlər',
  'qeydləri',
  'tapıntı',
  'tapıntılar',
  'tap',
  'göstər',
]);

function textOf(value: I18nText | null | undefined, locale: Locale): string {
  return value ? resolveLocalized(value, locale) : '';
}

function includesAny(text: string, aliases: string[]): boolean {
  return aliases.some((a) => text.includes(a));
}

const SUGGESTED_AUDIT_QUERIES: Record<Locale, string[]> = {
  en: [
    'show overdue critical access findings',
    'backup evidence documents',
    'third-party high risks',
  ],
  az: ['gecikmiş kritik giriş qeydləri', 'backup sübut sənədləri', 'təchizatçı yüksək riskləri'],
  ru: [
    'просроченные критичные замечания по доступу',
    'документы-доказательства по резервному копированию',
    'высокие риски по поставщикам',
  ],
};

export function suggestedAuditQueries(locale: Locale): string[] {
  return SUGGESTED_AUDIT_QUERIES[locale] ?? SUGGESTED_AUDIT_QUERIES.en;
}

export function parseAuditQuery(raw: string) {
  const query = raw.trim();
  const lower = query.toLowerCase();
  const riskRating = RISK_ALIASES.find(([, aliases]) => includesAny(lower, aliases))?.[0];
  const status = STATUS_ALIASES.find(([, aliases]) => includesAny(lower, aliases))?.[0];
  const slaStatus = SLA_ALIASES.find(([, aliases]) => includesAny(lower, aliases))?.[0];
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
    .filter((term) => !SLA_ALIASES.some(([, aliases]) => aliases.some((a) => term.includes(a))))
    .filter((term) => !topicTerms.some((topicTerm) => term.includes(topicTerm)))
    .slice(0, 6);
  return {
    query,
    riskRating,
    status,
    slaStatus,
    topic: topic?.[0] ?? null,
    topicTerms,
    explicitTerms,
  };
}

export function explainAuditQuery(parsed: ReturnType<typeof parseAuditQuery>) {
  const matchedSignals = [
    parsed.riskRating ? `risk:${parsed.riskRating}` : null,
    parsed.status ? `status:${parsed.status}` : null,
    parsed.slaStatus ? `sla:${parsed.slaStatus}` : null,
    parsed.topic ? `topic:${parsed.topic}` : null,
    ...parsed.explicitTerms.map((term) => `term:${term}`),
  ].filter((signal): signal is string => Boolean(signal));
  const confidence = Math.min(
    0.95,
    0.35 +
      (parsed.riskRating ? 0.15 : 0) +
      (parsed.status ? 0.1 : 0) +
      (parsed.slaStatus ? 0.15 : 0) +
      (parsed.topic ? 0.2 : 0) +
      Math.min(parsed.explicitTerms.length, 3) * 0.05,
  );
  const confidenceLevel = confidence >= 0.75 ? 'high' : confidence >= 0.55 ? 'medium' : 'low';
  return {
    confidence,
    confidenceLevel,
    matchedSignals,
    deterministic: true,
    evidenceGroundedOnly: true,
  };
}

function matchesTerms(haystack: string, parsed: ReturnType<typeof parseAuditQuery>): boolean {
  if (parsed.topicTerms.length > 0 && !includesAny(haystack, parsed.topicTerms)) return false;
  if (
    parsed.explicitTerms.length > 0 &&
    !parsed.explicitTerms.every((term) => haystack.includes(term))
  ) {
    return false;
  }
  return true;
}

function evidenceReason(
  row: { relation: string | null; reviewStatus: string | null; status: string },
  parsed: ReturnType<typeof parseAuditQuery>,
): string {
  const reasons = [
    parsed.topic ? `topic ${parsed.topic}` : null,
    row.relation ? `relation ${row.relation}` : null,
    row.reviewStatus ? `review ${row.reviewStatus}` : null,
    row.status ? `document ${row.status}` : null,
  ].filter(Boolean);
  return reasons.length > 0 ? reasons.join(' · ') : 'matched evidence terms';
}

function isOpenForSla(row: Pick<AuditQueryFindingCandidate, 'status'>): boolean {
  return !['closed', 'remediated'].includes(row.status);
}

function isOverdueFinding(row: AuditQueryFindingCandidate, now: Date): boolean {
  return (
    row.slaStatus === 'overdue' ||
    Boolean(row.dueDate && row.dueDate.getTime() < now.getTime() && isOpenForSla(row))
  );
}

function findingReason(
  row: Pick<AuditQueryFindingCandidate, 'slaStatus' | 'dueDate'>,
  parsed: ReturnType<typeof parseAuditQuery>,
): string {
  const reasons = [
    parsed.riskRating ? `${parsed.riskRating} risk` : null,
    parsed.status ? `status ${parsed.status}` : null,
    parsed.slaStatus ? `SLA ${parsed.slaStatus}` : null,
    parsed.topic ? `topic ${parsed.topic}` : null,
    parsed.slaStatus === 'overdue' && row.dueDate
      ? `due ${row.dueDate.toISOString().slice(0, 10)}`
      : null,
  ].filter(Boolean);
  return reasons.length > 0 ? reasons.join(' · ') : 'matched query terms';
}

export function auditFindingHitsForQuery(
  rows: AuditQueryFindingCandidate[],
  parsed: ReturnType<typeof parseAuditQuery>,
  locale: Locale,
  now = new Date(),
  limit = 20,
): AuditQueryHit[] {
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
      row.slaStatus,
      row.dueDate?.toISOString().slice(0, 10),
      row.checklistRef,
      row.controlRef,
      checklistQuestion,
      controlObjective,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (parsed.riskRating && row.riskRating !== parsed.riskRating) continue;
    if (parsed.status && row.status !== parsed.status) continue;
    if (parsed.slaStatus === 'overdue' && !isOverdueFinding(row, now)) continue;
    if (parsed.slaStatus && parsed.slaStatus !== 'overdue' && row.slaStatus !== parsed.slaStatus) {
      continue;
    }
    if (!matchesTerms(haystack, parsed)) continue;

    hits.push({
      id: row.id,
      title,
      riskRating: row.riskRating,
      status: row.status,
      slaStatus: isOverdueFinding(row, now) ? 'overdue' : row.slaStatus,
      dueDate: row.dueDate?.toISOString() ?? null,
      engagementId: row.engagementId,
      controlRef: row.controlRef,
      checklistRef: row.checklistRef,
      snippet: description || recommendation || checklistQuestion || controlObjective,
      reason: findingReason(row, parsed),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function auditEvidenceHitsForQuery(
  rows: AuditQueryEvidenceCandidate[],
  parsed: ReturnType<typeof parseAuditQuery>,
  limit = 12,
): AuditQueryEvidenceHit[] {
  const evidenceHits: AuditQueryEvidenceHit[] = [];
  const seenEvidence = new Set<string>();
  const canMatchEvidence = parsed.topicTerms.length > 0 || parsed.explicitTerms.length > 0;
  for (const row of rows) {
    if (!canMatchEvidence) break;
    if (seenEvidence.has(row.id)) continue;
    const haystack = [
      row.filename,
      row.mime,
      row.status,
      row.category,
      row.entityType,
      row.relation,
      row.reviewStatus,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!matchesTerms(haystack, parsed)) continue;
    seenEvidence.add(row.id);
    evidenceHits.push({
      id: row.id,
      filename: row.filename,
      status: row.status,
      category: row.category,
      mime: row.mime,
      entityType: row.entityType,
      entityId: row.entityId,
      relation: row.relation,
      reviewStatus: row.reviewStatus,
      reason: evidenceReason(row, parsed),
    });
    if (evidenceHits.length >= limit) break;
  }
  return evidenceHits;
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

      const docs = await tx
        .select({
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          category: document.category,
          status: document.status,
        })
        .from(document)
        .where(
          and(
            isNull(document.deletedAt),
            or(
              ilike(document.filename, like),
              ilike(document.mime, like),
              ilike(document.status, like),
              ilike(document.category, like),
            ),
          ),
        )
        .limit(PER_TYPE);
      for (const d of docs) {
        out.push({
          type: 'document',
          id: d.id,
          label: d.filename,
          snippet: [d.category, d.status, d.mime].filter(Boolean).join(' · '),
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

  /**
   * T-H38/T-H69: deterministic conversational audit query over findings and evidence documents;
   * no unsupported LLM claims.
   */
  async askFindings(tenantId: string, q: string, locale: Locale) {
    const parsed = parseAuditQuery(q);
    if (!parsed.query) throw new BadRequestException('Нужен непустой параметр q');

    const { findingRows, evidenceRows } = await this.dbService.withTenant(tenantId, async (tx) => {
      const findingRows = await tx
        .select({
          id: finding.id,
          titleI18n: finding.titleI18n,
          descriptionI18n: finding.descriptionI18n,
          recommendationI18n: finding.recommendationI18n,
          riskRating: finding.riskRating,
          status: finding.status,
          slaStatus: finding.slaStatus,
          dueDate: finding.dueDate,
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
        .limit(200);

      const evidenceRows = await tx
        .select({
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          status: document.status,
          category: document.category,
          entityType: documentLink.entityType,
          entityId: documentLink.entityId,
          relation: documentLink.relation,
          reviewStatus: documentLink.reviewStatus,
          createdAt: document.createdAt,
        })
        .from(document)
        .leftJoin(documentLink, sql`${document.id} = ${documentLink.documentId}`)
        .where(isNull(document.deletedAt))
        .orderBy(sql`${document.createdAt} desc`)
        .limit(250);

      return { findingRows, evidenceRows };
    });

    const hits = auditFindingHitsForQuery(findingRows, parsed, locale);
    const evidenceHits = auditEvidenceHitsForQuery(evidenceRows, parsed);

    const totalCount = hits.length + evidenceHits.length;
    return {
      query: parsed.query,
      interpreted: {
        intent: 'audit_evidence_lookup',
        riskRating: parsed.riskRating ?? null,
        status: parsed.status ?? null,
        slaStatus: parsed.slaStatus ?? null,
        topic: parsed.topic,
        terms: parsed.explicitTerms,
        ...explainAuditQuery(parsed),
      },
      answer:
        totalCount === 0
          ? 'No matching findings or evidence documents were found in the current tenant.'
          : `Found ${hits.length} matching finding${hits.length === 1 ? '' : 's'} and ${
              evidenceHits.length
            } evidence document${evidenceHits.length === 1 ? '' : 's'}.`,
      count: hits.length,
      evidenceCount: evidenceHits.length,
      totalCount,
      hits,
      evidenceHits,
      suggestedQueries: suggestedAuditQueries(locale),
    };
  }
}
