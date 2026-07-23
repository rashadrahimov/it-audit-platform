import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { createKbAction, updateKbAction, uploadKbAttachmentAction } from './actions';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface KbEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  owner: string | null;
  ownerMembershipId: string | null;
  expiresAt: string | null;
  verified: boolean;
  trustVisible: boolean;
  attachments: KbAttachment[];
}
interface KbAttachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}
interface Member {
  id: string;
  fullName: string;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Knowledge base (T-082): поиск + создание Q&A-записей. */
export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug, sp] = await Promise.all([
    getTranslations('knowledgeBase'),
    getCurrentLocale(),
    getActiveTenantSlug(),
    searchParams,
  ]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};
  const q = sp.q?.trim() ?? '';

  const [res, memRes] = await Promise.all([
    apiFetch(`/kb${q ? `?q=${encodeURIComponent(q)}` : ''}`, { headers }),
    apiFetch(`/memberships?locale=${locale}`, { headers }),
  ]);
  const rawEntries: Omit<KbEntry, 'attachments'>[] = res.ok ? await res.json() : [];
  const attachments = await Promise.all(
    rawEntries.map(async (entry) => {
      const attachmentRes = await apiFetch(`/documents?entityType=kb_entry&entityId=${entry.id}`, {
        headers,
      });
      return attachmentRes.ok ? ((await attachmentRes.json()) as KbAttachment[]) : [];
    }),
  );
  const entries: KbEntry[] = rawEntries.map((entry, index) => ({
    ...entry,
    attachments: attachments[index] ?? [],
  }));
  const members: Member[] = memRes.ok ? await memRes.json() : [];
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* Поиск */}
      <form method="GET" data-testid="kb-search" className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder={t('searchPh')}
          aria-label={t('searchPh')}
          className={`flex-1 ${inputCls}`}
        />
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('search')}
        </button>
        {q && (
          <Link
            href="/knowledge-base"
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            {t('reset')}
          </Link>
        )}
      </form>

      {/* Создание */}
      <form
        action={createKbAction}
        data-testid="kb-create"
        className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap gap-3">
          <input
            name="question"
            required
            placeholder={t('questionPh')}
            aria-label={t('questionPh')}
            className={`flex-1 ${inputCls}`}
          />
          <input
            name="category"
            placeholder={t('category')}
            aria-label={t('category')}
            className={inputCls}
          />
          <select
            name="ownerMembershipId"
            defaultValue=""
            aria-label={t('owner')}
            className={inputCls}
          >
            <option value="">{t('ownerNone')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </select>
          <label className="flex flex-col text-xs text-secondary">
            <span>{t('expires')}</span>
            <input type="date" name="expiresAt" className={inputCls} />
          </label>
        </div>
        <textarea
          name="answer"
          required
          rows={2}
          placeholder={t('answerPh')}
          aria-label={t('answerPh')}
          className={inputCls}
        />
        <button
          type="submit"
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('add')}
        </button>
      </form>

      {entries.length === 0 ? (
        <section className="rounded-xl border border-border bg-white shadow-sm">
          <EmptyState text={t('empty')} />
        </section>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="kb-list">
          {entries.map((e) => (
            <li
              key={e.id}
              data-testid={`kb-entry-${e.id}`}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-white p-4 shadow-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{e.question}</span>
                {e.category && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-secondary">
                    {e.category}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    e.verified ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {e.verified ? t('verified') : t('expired')}
                </span>
                {e.trustVisible && (
                  <span
                    data-testid={`kb-trust-badge-${e.id}`}
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    {t('trustPublished')}
                  </span>
                )}
              </span>
              <p className="text-sm text-secondary">{e.answer}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                <span>
                  {t('owner')}: <span className="text-foreground">{e.owner ?? '—'}</span>
                </span>
                <span>
                  {t('expires')}:{' '}
                  <span className="text-foreground">
                    {e.expiresAt ? dateFmt.format(new Date(e.expiresAt)) : t('noExpiry')}
                  </span>
                </span>
              </div>
              <section className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                <h2 className="text-xs font-semibold text-foreground">{t('attachments')}</h2>
                {e.attachments.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {e.attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-secondary">
                          {attachment.filename} · {Math.max(1, Math.ceil(attachment.size / 1024))}{' '}
                          KB
                        </span>
                        <Link
                          href={`/documents/${attachment.id}/download`}
                          className="font-medium text-accent underline-offset-2 hover:underline"
                        >
                          {t('download')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-secondary">{t('noAttachments')}</p>
                )}
                <form
                  action={uploadKbAttachmentAction.bind(null, e.id)}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="file"
                    name="file"
                    required
                    aria-label={`${t('attachmentFile')}: ${e.question}`}
                    className="min-w-0 flex-1 text-xs text-secondary file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                  />
                  <button
                    type="submit"
                    data-testid={`kb-attachment-upload-${e.id}`}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                  >
                    {t('addAttachment')}
                  </button>
                </form>
              </section>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-medium text-accent">
                  {t('edit')}
                </summary>
                <form
                  action={updateKbAction.bind(null, e.id)}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <select
                    name="ownerMembershipId"
                    aria-label={`${t('owner')}: ${e.question}`}
                    defaultValue={e.ownerMembershipId ?? ''}
                    data-testid={`kb-owner-${e.id}`}
                    className={inputCls}
                  >
                    <option value="">{t('ownerNone')}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    name="expiresAt"
                    aria-label={`${t('expires')}: ${e.question}`}
                    defaultValue={e.expiresAt ? e.expiresAt.slice(0, 10) : ''}
                    className={inputCls}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-secondary">
                    <input
                      type="checkbox"
                      name="trustVisible"
                      defaultChecked={e.trustVisible}
                      data-testid={`kb-trust-${e.id}`}
                      className="h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {t('trustVisible')}
                  </label>
                  <button
                    type="submit"
                    data-testid={`kb-save-${e.id}`}
                    className="rounded-md border border-border px-3 py-2 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted"
                  >
                    {t('save')}
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
