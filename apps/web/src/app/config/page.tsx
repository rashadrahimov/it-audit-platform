import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { createAuditTypeAction, createTagAction } from './actions';

export const dynamic = 'force-dynamic';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}
interface AuditType {
  id: string;
  code: string;
  name: string;
  isGlobal: boolean;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const btnCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Настройки тенанта (T-084/T-076): справочник типов аудита + теги. */
export default async function ConfigPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('config'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [typesRes, tagsRes] = await Promise.all([
    apiFetch('/audit-types', { headers }),
    apiFetch('/tags', { headers }),
  ]);
  const types: AuditType[] = typesRes.ok ? await typesRes.json() : [];
  const tags: Tag[] = tagsRes.ok ? await tagsRes.json() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
        <Link
          href="/account"
          className="text-sm text-accent underline-offset-2 transition-colors duration-150 hover:underline"
        >
          {t('toAccount')}
        </Link>
      </div>

      {/* Типы аудита */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('auditTypes')}</h2>
        <form
          action={createAuditTypeAction}
          data-testid="audit-type-create"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <input name="code" required placeholder={t('codePh')} className={inputCls} />
          <input name="name" required placeholder={t('namePh')} className={`flex-1 ${inputCls}`} />
          <button type="submit" className={btnCls}>
            {t('add')}
          </button>
        </form>
        <ul className="flex flex-wrap gap-2" data-testid="audit-types-list">
          {types.map((at) => (
            <li
              key={at.id}
              className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-sm shadow-sm"
            >
              <span className="font-medium text-foreground">{at.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  at.isGlobal ? 'bg-muted text-secondary' : 'bg-sky-100 text-sky-700'
                }`}
              >
                {at.isGlobal ? t('global') : t('custom')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Теги */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('tags')}</h2>
        <form
          action={createTagAction}
          data-testid="tag-create"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <input name="name" required placeholder={t('tagPh')} className={`flex-1 ${inputCls}`} />
          <input
            name="color"
            type="color"
            defaultValue="#0369A1"
            className="h-10 w-14 rounded-md border border-border"
            aria-label={t('color')}
          />
          <button type="submit" className={btnCls}>
            {t('add')}
          </button>
        </form>
        {tags.length === 0 ? (
          <p className="rounded-xl border border-border bg-white px-4 py-6 text-center text-secondary shadow-sm">
            {t('empty')}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="tags-list">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-sm shadow-sm"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: tag.color ?? 'transparent' }}
                  aria-hidden
                />
                <span className="font-medium text-foreground">{tag.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
