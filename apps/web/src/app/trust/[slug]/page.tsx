import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/session';
import { LogoLockup } from '@/components/logo';
import { RequestAccessForm } from './request-form';

export const dynamic = 'force-dynamic';

interface Item {
  label: string;
  category: string;
}
interface PublicView {
  slug: string;
  title: string;
  intro: string | null;
  items: Item[];
}
interface GrantedView {
  title: string;
  grantedTo: string;
  items: Item[];
}

/** ПУБЛИЧНАЯ страница Trust Center (T-V30): постура + запрос доступа + granted-вид по токену. */
export default async function TrustPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ slug }, sp, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('trustPublic'),
  ]);
  const token = typeof sp.token === 'string' ? sp.token : '';

  // granted-вид по токену
  if (token) {
    const gRes = await apiFetch(
      `/trust/${encodeURIComponent(slug)}/granted/${encodeURIComponent(token)}`,
    );
    if (!gRes.ok) notFound();
    const g: GrantedView = await gRes.json();
    return (
      <Shell title={g.title} poweredBy={t('poweredBy')}>
        <div className="rounded-xl bg-white/10 p-5">
          <p className="text-xs font-medium tracking-wide text-white/60 uppercase">
            {t('granted')}
          </p>
          <p className="mt-1 text-sm text-white/80">
            {t('grantedTo')}: <span className="font-medium text-white">{g.grantedTo}</span>
          </p>
          <ItemList items={g.items} />
        </div>
      </Shell>
    );
  }

  const res = await apiFetch(`/trust/${encodeURIComponent(slug)}`);
  if (!res.ok) notFound();
  const data: PublicView = await res.json();

  return (
    <Shell title={data.title} poweredBy={t('poweredBy')}>
      {data.intro && <p className="text-sm text-white/70">{data.intro}</p>}
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl bg-white/10 p-5">
          <p className="text-xs font-medium tracking-wide text-white/60 uppercase">
            {t('posture')}
          </p>
          <ItemList items={data.items} />
        </div>
        <div className="rounded-xl bg-white/10 p-5">
          <RequestAccessForm
            slug={slug}
            labels={{
              requestTitle: t('requestTitle'),
              requestHint: t('requestHint'),
              email: t('email'),
              company: t('company'),
              message: t('message'),
              send: t('send'),
              sent: t('sent'),
              error: t('error'),
            }}
          />
        </div>
      </div>
    </Shell>
  );
}

function ItemList({ items }: { items: Item[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2" data-testid="trust-public-items">
      {items.map((item, i) => (
        <li
          key={`${item.label}-${i}`}
          className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm"
        >
          <span className="font-medium text-white">{item.label}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
            {item.category}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Shell({
  title,
  poweredBy,
  children,
}: {
  title: string;
  poweredBy: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-primary text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
        <div className="flex items-center gap-2 text-white">
          <LogoLockup />
        </div>
        <h1 className="text-3xl font-bold" data-testid="trust-public-title">
          {title}
        </h1>
        {children}
        <p className="mt-6 text-xs text-white/40">{poweredBy}</p>
      </div>
    </main>
  );
}
