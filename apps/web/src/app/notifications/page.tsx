import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { markReadAction } from './actions';

export const dynamic = 'force-dynamic';

type NotifType = 'info' | 'warning' | 'action';
interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string | null;
  read: boolean;
}
interface NotifResponse {
  unread: number;
  items: Notification[];
}

const TYPE_TONE: Record<NotifType, string> = {
  info: 'bg-sky-100 text-sky-700',
  warning: 'bg-amber-100 text-amber-700',
  action: 'bg-indigo-100 text-indigo-700',
};

/** Уведомления (T-096): список + счётчик непрочитанных + отметить прочитанным. */
export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([
    getTranslations('notifications'),
    getActiveTenantSlug(),
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const res = await apiFetch('/notifications', { headers });
  const data: NotifResponse = res.ok ? await res.json() : { unread: 0, items: [] };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          {t('title')}
          {data.unread > 0 && (
            <span
              data-testid="unread-badge"
              className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-on-primary"
            >
              {data.unread}
            </span>
          )}
        </h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      {data.items.length === 0 ? (
        <section className="rounded-xl border border-border bg-white p-8 text-center text-secondary shadow-sm">
          {t('empty')}
        </section>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="notifications-list">
          {data.items.map((n) => (
            <li
              key={n.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 shadow-sm ${
                n.read ? 'border-border bg-white' : 'border-accent/30 bg-accent/5'
              }`}
            >
              <div className="flex flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_TONE[n.type]}`}
                  >
                    {t(`type.${n.type}`)}
                  </span>
                  <span className="font-medium text-foreground">{n.title}</span>
                  {!n.read && (
                    <span className="h-2 w-2 rounded-full bg-accent" aria-label={t('new')} />
                  )}
                </span>
                {n.body && <p className="text-sm text-secondary">{n.body}</p>}
              </div>
              {!n.read && (
                <form action={markReadAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-border px-2 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t('markRead')}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
