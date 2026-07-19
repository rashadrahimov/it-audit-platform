import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { activateFrameworkAction, deactivateFrameworkAction } from '../actions';

export const dynamic = 'force-dynamic';

interface Requirement {
  id: string;
  ref: string;
  title: string;
  parentId: string | null;
}
interface FrameworkDetail {
  id: string;
  name: string;
  version: string;
  domain: string | null;
  requirements: Requirement[];
}
interface Coverage {
  total: number;
  covered: number;
  percent: number;
  uncovered: string[];
}
interface Evidence {
  total: number;
  withEvidence: number;
  percent: number;
  missing: string[];
}
interface AuditRow {
  id: string;
  title: string;
  state: string;
  items: number;
}

interface ReqNode extends Requirement {
  children: ReqNode[];
}

function buildTree(reqs: Requirement[]): ReqNode[] {
  const map = new Map<string, ReqNode>();
  const roots: ReqNode[] = [];
  for (const r of reqs) map.set(r.id, { ...r, children: [] });
  for (const node of map.values()) {
    const parent = node.parentId ? map.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Страница фреймворка (T-V25): дерево требований, coverage, evidence, audit-ends. */
export default async function FrameworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, { id }] = await Promise.all([
    getTranslations('frameworks'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    params,
  ]);
  if (!tenantSlug) redirect('/account');
  const headers = { 'X-Tenant-Slug': tenantSlug };

  const res = await apiFetch(`/frameworks/${id}/requirements?locale=${locale}`);
  if (!res.ok) redirect('/frameworks');
  const fw: FrameworkDetail = await res.json();

  const [covRes, evRes, auditsRes, listRes] = await Promise.all([
    apiFetch(`/frameworks/${id}/coverage`),
    apiFetch(`/frameworks/${id}/evidence`, { headers }),
    apiFetch(`/frameworks/${id}/audits?locale=${locale}`, { headers }),
    apiFetch(`/frameworks?locale=${locale}&tenantSlug=${tenantSlug}`),
  ]);
  const coverage: Coverage | null = covRes.ok ? await covRes.json() : null;
  const evidence: Evidence | null = evRes.ok ? await evRes.json() : null;
  const audits: AuditRow[] = auditsRes.ok ? await auditsRes.json() : [];
  const catalog: Array<{ id: string; isActive: boolean | null }> = listRes.ok
    ? await listRes.json()
    : [];
  const isActive = catalog.find((f) => f.id === id)?.isActive === true;

  const tree = buildTree(fw.requirements);

  const percentBar = (
    label: string,
    value: { percent: number } | null,
    sub: string,
    tid: string,
  ) => (
    <div
      className="flex flex-1 flex-col gap-1.5 rounded-xl border border-border bg-white p-4 shadow-sm"
      data-testid={tid}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-secondary">{label}</span>
        <span className="text-lg font-bold text-primary tabular-nums">
          {value ? `${value.percent}%` : '—'}
        </span>
      </div>
      <span className="h-2 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${value?.percent ?? 0}%` }}
        />
      </span>
      <span className="text-xs text-secondary">{sub}</span>
    </div>
  );

  const renderNode = (node: ReqNode) => (
    <li key={node.id}>
      <span className="flex items-baseline gap-2 py-0.5">
        <span className="font-mono text-xs text-accent">{node.ref}</span>
        <span className="text-sm text-foreground">{node.title}</span>
      </span>
      {node.children.length > 0 && (
        <ul className="ml-5 border-l border-border pl-3">{node.children.map(renderNode)}</ul>
      )}
    </li>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pt-12">
      <div>
        <Link
          href="/frameworks"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          ← {t('title')}
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3" data-testid="framework-header">
        <h1 className="text-2xl font-bold text-primary">{fw.name}</h1>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
          {fw.version}
        </span>
        {fw.domain && ['security', 'privacy', 'industry', 'custom'].includes(fw.domain) && (
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
            {t(`dom.${fw.domain}`)}
          </span>
        )}
        {isActive ? (
          <form action={deactivateFrameworkAction.bind(null, fw.id)}>
            <button
              type="submit"
              data-testid="fw-deactivate"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('remove')}
            </button>
          </form>
        ) : (
          <form action={activateFrameworkAction.bind(null, fw.id)}>
            <button
              type="submit"
              data-testid="fw-activate"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t('addFramework')}
            </button>
          </form>
        )}
      </header>

      <div className="flex flex-col gap-4 sm:flex-row">
        {percentBar(
          t('coverage'),
          coverage,
          coverage ? t('coverageSub', { covered: coverage.covered, total: coverage.total }) : '—',
          'fw-coverage',
        )}
        {percentBar(
          t('evidenceCompleteness'),
          evidence,
          evidence ? t('evidenceSub', { n: evidence.withEvidence, total: evidence.total }) : '—',
          'fw-evidence',
        )}
      </div>

      <section
        className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="fw-audits"
      >
        <h2 className="text-sm font-semibold text-primary">{t('audits')}</h2>
        {audits.length === 0 ? (
          <p className="text-sm text-secondary">{t('noAudits')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {audits.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href={`/engagements/${a.id}`}
                  className="font-medium text-foreground underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                >
                  {a.title}
                </Link>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                  {a.state}
                </span>
                <span className="text-xs text-secondary tabular-nums">
                  {t('checklistItems', { n: a.items })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 shadow-sm"
        data-testid="fw-requirements"
      >
        <h2 className="text-sm font-semibold text-primary">
          {t('requirements')} · {fw.requirements.length}
        </h2>
        {tree.length === 0 ? (
          <p className="text-sm text-secondary">—</p>
        ) : (
          <ul className="flex flex-col gap-0.5">{tree.map(renderNode)}</ul>
        )}
      </section>
    </main>
  );
}
