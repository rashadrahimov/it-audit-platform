import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';

export const dynamic = 'force-dynamic';

interface EngagementRow {
  id: string;
  title: string;
  state: string;
  subsidiary: string | null;
  auditType: string | null;
}

interface FollowUpItem {
  id: string;
  title: string;
  riskRating: string;
  status: string;
  owner: string | null;
  dueDate: string | null;
  nextAction: string;
  lane: 'remediation' | 'retest' | 'monitor';
  daysPastDue: number | null;
  daysUntilDue: number | null;
}

interface FollowUpPlan {
  summary: {
    openFindings: number;
    remediationQueue: number;
    readyForRetest: number;
    overdue: number;
    dueSoon: number;
    unassigned: number;
  };
  lanes: {
    remediation: FollowUpItem[];
    retest: FollowUpItem[];
    monitor: FollowUpItem[];
  };
}

interface ReportReadiness {
  score: number;
  ready: boolean;
  findingsOpen: number;
  risks: number;
  evidenceLinks: number;
}

interface ReportPackageManifest {
  deliverables: Array<{
    key: string;
    title: string;
    formats: Array<{ key: string; href: string }>;
  }>;
}

const copy = {
  en: {
    title: 'Action Plan',
    kicker: 'Remediation cockpit',
    subtitle:
      'A dedicated workspace for the standard Action Plan deliverable: open findings, owners, due dates, re-test queue and export links in one place.',
    select: 'Audit',
    openFindings: 'Open findings',
    remediationQueue: 'Remediation queue',
    readyForRetest: 'Ready for re-test',
    overdue: 'Overdue',
    dueSoon: 'Due soon',
    unassigned: 'Unassigned',
    exportTitle: 'Standard deliverable export',
    exportHint:
      'Download the Action Plan from the same verified report package as PDF, Word or Excel.',
    package: 'Full package',
    readiness: 'Report readiness',
    evidence: 'Evidence links',
    risks: 'Risks in matrix',
    remediation: 'Remediation lane',
    retest: 'Re-test lane',
    monitor: 'Monitor lane',
    empty: 'Nothing in this lane.',
    owner: 'Owner',
    due: 'Due',
    viewFinding: 'View finding',
    findingsLink: 'Open findings workbench',
    reportsLink: 'Open full reports',
    noAudit: 'Create an audit first to generate an Action Plan.',
  },
  ru: {
    title: 'План действий',
    kicker: 'Пульт ремедиации',
    subtitle:
      'Отдельное рабочее место для стандартного deliverable Action Plan: открытые замечания, владельцы, сроки, очередь ре-теста и экспорт в одном месте.',
    select: 'Аудит',
    openFindings: 'Открытые замечания',
    remediationQueue: 'Очередь ремедиации',
    readyForRetest: 'Готово к ре-тесту',
    overdue: 'Просрочено',
    dueSoon: 'Скоро срок',
    unassigned: 'Без владельца',
    exportTitle: 'Экспорт стандартного документа',
    exportHint:
      'Скачайте План действий из того же проверяемого пакета отчётности в PDF, Word или Excel.',
    package: 'Весь пакет',
    readiness: 'Готовность отчёта',
    evidence: 'Привязки доказательств',
    risks: 'Риски в матрице',
    remediation: 'Очередь ремедиации',
    retest: 'Очередь ре-теста',
    monitor: 'Мониторинг',
    empty: 'В этой очереди пока пусто.',
    owner: 'Владелец',
    due: 'Срок',
    viewFinding: 'Открыть замечание',
    findingsLink: 'Открыть работу с замечаниями',
    reportsLink: 'Открыть все отчёты',
    noAudit: 'Сначала создайте аудит, чтобы сформировать План действий.',
  },
  az: {
    title: 'Fəaliyyət planı',
    kicker: 'Remediasiya paneli',
    subtitle:
      'Standart Action Plan sənədi üçün ayrıca iş sahəsi: açıq tapıntılar, sahiblər, tarixlər, təkrar-test növbəsi və eksport linkləri.',
    select: 'Audit',
    openFindings: 'Açıq tapıntılar',
    remediationQueue: 'Remediasiya növbəsi',
    readyForRetest: 'Təkrar-testə hazır',
    overdue: 'Gecikmiş',
    dueSoon: 'Tezliklə bitir',
    unassigned: 'Sahibsiz',
    exportTitle: 'Standart sənəd eksportu',
    exportHint:
      'Fəaliyyət planını eyni yoxlanılmış hesabat paketindən PDF, Word və ya Excel kimi endirin.',
    package: 'Tam paket',
    readiness: 'Hesabat hazırlığı',
    evidence: 'Sübut linkləri',
    risks: 'Matrisdə risklər',
    remediation: 'Remediasiya xətti',
    retest: 'Təkrar-test xətti',
    monitor: 'Monitorinq',
    empty: 'Bu xətdə hələ heç nə yoxdur.',
    owner: 'Sahib',
    due: 'Tarix',
    viewFinding: 'Tapıntını aç',
    findingsLink: 'Tapıntılar iş sahəsi',
    reportsLink: 'Bütün hesabatlar',
    noAudit: 'Fəaliyyət planı yaratmaq üçün əvvəlcə audit yaradın.',
  },
} as const;

const ratingTone: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
  not_applicable: 'bg-muted text-secondary',
};

const laneOrder = ['remediation', 'retest', 'monitor'] as const;

export default async function ActionPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ engagementId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [locale, tenantSlug, sp] = await Promise.all([
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const t = copy[locale];
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [engagementRes, followUpRes] = await Promise.all([
    apiFetch(`/engagements?locale=${locale}`, { headers }),
    apiFetch(`/findings/follow-up-plan?locale=${locale}`, { headers }),
  ]);
  const engagements: EngagementRow[] = engagementRes.ok ? await engagementRes.json() : [];
  const followUp: FollowUpPlan | null = followUpRes.ok ? await followUpRes.json() : null;
  const selected = engagements.find((e) => e.id === sp.engagementId) ?? engagements[0] ?? null;

  let readiness: ReportReadiness | null = null;
  let manifest: ReportPackageManifest | null = null;
  if (selected) {
    const [readinessRes, manifestRes] = await Promise.all([
      apiFetch(`/engagements/${selected.id}/report/readiness?locale=${locale}`, { headers }),
      apiFetch(`/engagements/${selected.id}/report/package-manifest?locale=${locale}`, { headers }),
    ]);
    readiness = readinessRes.ok ? await readinessRes.json() : null;
    manifest = manifestRes.ok ? await manifestRes.json() : null;
  }

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const actionPlan = manifest?.deliverables.find((d) => d.key === 'action_plan') ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6 pt-12">
      <section className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/70 to-teal-50/80 p-5 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">{t.kicker}</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">{t.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/findings"
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-accent shadow-xs transition-colors hover:bg-emerald-50"
            >
              {t.findingsLink}
            </Link>
            <Link
              href="/reports"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-primary shadow-xs transition-colors hover:bg-accent/90"
            >
              {t.reportsLink}
            </Link>
          </div>
        </div>
      </section>

      {selected ? (
        <>
          <form className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <label className="flex flex-col gap-2 text-sm font-medium text-primary md:max-w-md">
              {t.select}
              <select
                name="engagementId"
                defaultValue={selected.id}
                className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {engagements.map((engagement) => (
                  <option key={engagement.id} value={engagement.id}>
                    {engagement.title} · {engagement.subsidiary ?? '—'} · {engagement.state}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted"
            >
              {t.select}
            </button>
          </form>

          <section className="grid gap-3 md:grid-cols-6" data-testid="action-plan-summary">
            {followUp &&
              (
                [
                  ['openFindings', followUp.summary.openFindings],
                  ['remediationQueue', followUp.summary.remediationQueue],
                  ['readyForRetest', followUp.summary.readyForRetest],
                  ['overdue', followUp.summary.overdue],
                  ['dueSoon', followUp.summary.dueSoon],
                  ['unassigned', followUp.summary.unassigned],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                  <div className="text-2xl font-bold text-primary tabular-nums">{value}</div>
                  <div className="text-xs text-secondary">{t[key]}</div>
                </div>
              ))}
          </section>

          <section
            className="rounded-2xl border border-border bg-white p-5 shadow-sm"
            data-testid="action-plan-export"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-primary">{t.exportTitle}</h2>
                <p className="mt-1 max-w-2xl text-sm text-secondary">{t.exportHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/engagements/${selected.id}/report/package?locale=${locale}`}
                  className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-accent/90"
                >
                  {t.package}
                </a>
                {actionPlan?.formats.map((format) => (
                  <a
                    key={format.key}
                    href={format.href}
                    className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-secondary transition-colors hover:bg-muted"
                  >
                    {format.key.toUpperCase()}
                  </a>
                ))}
              </div>
            </div>
            {readiness && (
              <dl className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-muted/60 p-3">
                  <dd className="text-xl font-bold text-primary tabular-nums">
                    {readiness.score}%
                  </dd>
                  <dt className="text-xs text-secondary">{t.readiness}</dt>
                </div>
                <div className="rounded-xl bg-muted/60 p-3">
                  <dd className="text-xl font-bold text-primary tabular-nums">
                    {readiness.findingsOpen}
                  </dd>
                  <dt className="text-xs text-secondary">{t.openFindings}</dt>
                </div>
                <div className="rounded-xl bg-muted/60 p-3">
                  <dd className="text-xl font-bold text-primary tabular-nums">{readiness.risks}</dd>
                  <dt className="text-xs text-secondary">{t.risks}</dt>
                </div>
                <div className="rounded-xl bg-muted/60 p-3">
                  <dd className="text-xl font-bold text-primary tabular-nums">
                    {readiness.evidenceLinks}
                  </dd>
                  <dt className="text-xs text-secondary">{t.evidence}</dt>
                </div>
              </dl>
            )}
          </section>

          {followUp && (
            <section className="grid gap-4 lg:grid-cols-3">
              {laneOrder.map((lane) => (
                <div key={lane} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-primary">{t[lane]}</h2>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                      {followUp.lanes[lane].length}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {followUp.lanes[lane].slice(0, 8).map((item) => (
                      <li key={item.id} className="rounded-xl bg-muted/60 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/findings/${item.id}`}
                            className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
                          >
                            {item.title}
                          </Link>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${ratingTone[item.riskRating] ?? 'bg-muted text-secondary'}`}
                          >
                            {item.riskRating}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-secondary">
                          <span>
                            {t.owner}: {item.owner ?? '—'}
                          </span>
                          {item.dueDate && (
                            <>
                              <span>·</span>
                              <span>
                                {t.due}: {dateFmt.format(new Date(item.dueDate))}
                              </span>
                            </>
                          )}
                          {item.daysPastDue !== null && (
                            <>
                              <span>·</span>
                              <span className="font-semibold text-red-700">
                                +{item.daysPastDue}
                              </span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                    {followUp.lanes[lane].length === 0 && (
                      <li className="rounded-xl bg-muted/60 p-3 text-sm text-secondary">
                        {t.empty}
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </>
      ) : (
        <section className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-secondary">{t.noAudit}</p>
          <Link
            href="/engagements"
            className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-primary"
          >
            {t.select}
          </Link>
        </section>
      )}
    </main>
  );
}
