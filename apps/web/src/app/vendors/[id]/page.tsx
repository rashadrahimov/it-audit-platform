import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

type RiskClass = 'low' | 'medium' | 'high' | 'critical';
interface VendorDetail {
  id: string;
  name: string;
  category: string | null;
  url: string | null;
  inherentRisk: RiskClass | null;
  residualRisk: RiskClass | null;
  status: 'procurement' | 'active' | 'archived';
}
interface Assessment {
  id: string;
  type: string | null;
  state: string;
  recommendation: string | null;
  evidenceStatus: string | null;
}

const RISK_TONE: Record<RiskClass, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

/** Drill-down карточки вендора (T-060/061): детали + assessment'ы. */
export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug, { id }] = await Promise.all([
    getTranslations('vendors'),
    getActiveTenantSlug(),
    params,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch(`/vendors/${id}`, { headers });
  if (!res.ok) notFound();
  const vendor: VendorDetail = await res.json();
  const aRes = await apiFetch(`/vendors/${id}/assessments`, { headers });
  const assessments: Assessment[] = aRes.ok ? await aRes.json() : [];

  const riskBadge = (r: RiskClass | null, label: string) => (
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-secondary">{label}:</span>
      {r ? (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RISK_TONE[r]}`}>
          {t(`cls.${r}`)}
        </span>
      ) : (
        <span className="text-secondary">—</span>
      )}
    </div>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{vendor.name}</h1>
        <Link
          href="/vendors"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('back')}
        </Link>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {riskBadge(vendor.inherentRisk, t('risk'))}
          {riskBadge(vendor.residualRisk, t('residual'))}
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-secondary">{t('statusLabel')}:</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary">
              {t(`status.${vendor.status}`)}
            </span>
          </div>
        </div>
        {vendor.category && (
          <p className="text-sm text-secondary">
            {t('category')}: <span className="text-foreground">{vendor.category}</span>
          </p>
        )}
        {vendor.url && (
          <p className="text-sm text-secondary">
            {t('url')}:{' '}
            <span className="break-all text-foreground">{vendor.url}</span>
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-secondary">{t('assessments')}</h2>
        {assessments.length === 0 ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-secondary shadow-sm">
            {t('noAssessments')}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-white shadow-sm" data-testid="vendor-assessments">
            {assessments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <span className="text-foreground">{a.type ?? '—'}</span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-secondary">
                  {a.state}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
