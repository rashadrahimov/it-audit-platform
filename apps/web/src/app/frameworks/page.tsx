import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import { activateFrameworkAction, deactivateFrameworkAction } from './actions';

export const dynamic = 'force-dynamic';

interface FrameworkRow {
  id: string;
  name: string;
  version: string;
  status: string;
  domain: string | null;
  isGlobal: boolean;
  isActive: boolean | null;
}
interface MappingSummary {
  activeFrameworks: number;
  totalRequirements: number;
  coveredRequirements: number;
  coveragePercent: number;
  mappedControls: number;
  reusableControls: number;
  unmappedControls: number;
  byFramework: Array<{
    frameworkId: string;
    name: string;
    version: string;
    total: number;
    covered: number;
    percent: number;
    uncovered: string[];
  }>;
  topReusableControls: Array<{
    id: string;
    ref: string;
    objective: string;
    frameworks: string[];
    requirements: number;
  }>;
  evidenceReuse: {
    evidenceDocuments: number;
    reusableEvidenceDocuments: number;
    coveredRequirementsWithEvidence: number;
    evidenceCoveragePercent: number;
    topDocuments: Array<{
      documentId: string;
      filename: string;
      frameworks: number;
      requirements: number;
      controls: string[];
      reviewStatuses: string[];
      relations: string[];
    }>;
  };
}

const DOMAINS = ['security', 'privacy', 'industry', 'custom'];
const DOMAIN_TONE: Record<string, string> = {
  security: 'bg-emerald-100 text-emerald-700',
  privacy: 'bg-violet-100 text-violet-700',
  industry: 'bg-amber-100 text-amber-700',
  custom: 'bg-muted text-secondary',
};

/** Каталог стандартов (T-030 → T-V25): Active/Available, активация per-tenant. */
export default async function FrameworksPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('frameworks'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  const qs = tenantSlug ? `&tenantSlug=${tenantSlug}` : '';
  const [res, mapRes] = await Promise.all([
    apiFetch(`/frameworks?locale=${locale}${qs}`),
    apiFetch(`/frameworks/mapping-summary?locale=${locale}${qs}`),
  ]);
  const frameworks: FrameworkRow[] = res.ok ? await res.json() : [];
  const mapping: MappingSummary | null = mapRes.ok ? await mapRes.json() : null;
  const active = frameworks.filter((fw) => fw.isActive === true);
  const available = frameworks.filter((fw) => fw.isActive !== true);

  const domainChip = (domain: string | null) =>
    domain && DOMAINS.includes(domain) ? (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOMAIN_TONE[domain] ?? 'bg-muted text-secondary'}`}
      >
        {t(`dom.${domain}`)}
      </span>
    ) : null;

  const table = (rows: FrameworkRow[], mode: 'active' | 'available', testid: string) => (
    <section className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
      <table className="w-full text-left text-sm" data-testid={testid}>
        <thead>
          <tr className="border-b border-border text-secondary">
            <th className="px-4 py-3 font-medium">{t('name')}</th>
            <th className="px-4 py-3 font-medium">{t('version')}</th>
            <th className="px-4 py-3 font-medium">{t('domain')}</th>
            <th className="px-4 py-3 font-medium">{t('origin')}</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((fw) => (
            <tr key={fw.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/frameworks/${fw.id}`}
                  className="font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                >
                  {fw.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-secondary">{fw.version}</td>
              <td className="px-4 py-3">{domainChip(fw.domain) ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
                  {fw.isGlobal ? t('global') : t('tenant')}
                </span>
              </td>
              <td className="px-4 py-3">
                {mode === 'available' ? (
                  <form action={activateFrameworkAction.bind(null, fw.id)}>
                    <button
                      type="submit"
                      data-testid="fw-activate"
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('addFramework')}
                    </button>
                  </form>
                ) : (
                  <form action={deactivateFrameworkAction.bind(null, fw.id)}>
                    <button
                      type="submit"
                      data-testid="fw-deactivate"
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {t('remove')}
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="p-0">
                <EmptyState size="sm" text={mode === 'active' ? t('noActive') : t('empty')} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      {mapping && (
        <section
          className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm"
          data-testid="framework-mapping-summary"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
                {t('mappingKicker')}
              </p>
              <h2 className="text-lg font-semibold text-primary">{t('mappingTitle')}</h2>
              <p className="mt-1 text-sm text-secondary">{t('mappingSub')}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-900 shadow-sm">
              {mapping.coveragePercent}% {t('mapped')}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            {(
              [
                ['activeFrameworks', mapping.activeFrameworks],
                [
                  'coveredRequirements',
                  `${mapping.coveredRequirements}/${mapping.totalRequirements}`,
                ],
                ['reusableControls', mapping.reusableControls],
                ['unmappedControls', mapping.unmappedControls],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-white/80 p-3 shadow-sm">
                <dd className="text-xl font-bold tabular-nums text-primary">{value}</dd>
                <dt className="text-xs text-secondary">{t(key)}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border border-emerald-100 bg-white/80 p-3">
              <h3 className="mb-2 text-sm font-semibold text-primary">
                {t('coverageByFramework')}
              </h3>
              <ul className="grid gap-2">
                {mapping.byFramework.slice(0, 5).map((fw) => (
                  <li key={fw.frameworkId}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-foreground">
                        {fw.name} <span className="text-secondary">{fw.version}</span>
                      </span>
                      <span className="font-semibold tabular-nums text-primary">{fw.percent}%</span>
                    </div>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${fw.percent}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white/80 p-3">
              <h3 className="mb-2 text-sm font-semibold text-primary">{t('reusable')}</h3>
              {mapping.topReusableControls.length === 0 ? (
                <p className="text-sm text-secondary">{t('noReusable')}</p>
              ) : (
                <ul className="grid gap-2">
                  {mapping.topReusableControls.slice(0, 4).map((control) => (
                    <li key={control.id} className="text-sm">
                      <Link
                        href={`/controls/${control.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {control.ref}
                      </Link>
                      <span className="ml-2 text-secondary">
                        {t('coversFrameworks', {
                          n: control.frameworks.length,
                          r: control.requirements,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div
            className="mt-4 rounded-xl border border-emerald-100 bg-white/85 p-3"
            data-testid="framework-evidence-reuse"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-primary">{t('evidenceReuse')}</h3>
                <p className="mt-1 text-xs text-secondary">
                  {t('evidenceReuseSub', {
                    docs: mapping.evidenceReuse.reusableEvidenceDocuments,
                    requirements: mapping.evidenceReuse.coveredRequirementsWithEvidence,
                  })}
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                {mapping.evidenceReuse.evidenceCoveragePercent}% {t('evidenceMapped')}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 sm:grid-cols-3">
              {(
                [
                  ['evidenceDocuments', mapping.evidenceReuse.evidenceDocuments],
                  ['reusableEvidenceDocuments', mapping.evidenceReuse.reusableEvidenceDocuments],
                  [
                    'coveredRequirementsWithEvidence',
                    mapping.evidenceReuse.coveredRequirementsWithEvidence,
                  ],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-emerald-50/80 p-2">
                  <dd className="text-lg font-bold tabular-nums text-primary">{value}</dd>
                  <dt className="text-xs text-secondary">{t(key)}</dt>
                </div>
              ))}
            </dl>
            {mapping.evidenceReuse.topDocuments.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">{t('noEvidenceReuse')}</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {mapping.evidenceReuse.topDocuments.slice(0, 4).map((doc) => (
                  <li key={doc.documentId} className="rounded-lg bg-white/90 p-2 text-sm">
                    <span className="font-medium text-foreground">{doc.filename}</span>
                    <span className="ml-2 text-secondary">
                      {t('evidenceCovers', {
                        f: doc.frameworks,
                        r: doc.requirements,
                        c: doc.controls.join(', '),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-secondary">{t('active')}</h2>
        {table(active, 'active', 'frameworks-active')}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-secondary">{t('available')}</h2>
        {table(available, 'available', 'frameworks-available')}
      </div>
    </main>
  );
}
