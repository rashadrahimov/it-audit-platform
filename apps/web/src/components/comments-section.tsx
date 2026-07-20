import { getLocale, getTranslations } from 'next-intl/server';
import { addEntityCommentAction } from '@/lib/comment-actions';

export interface CommentItem {
  author: string;
  body: string;
  at: string;
}

/**
 * T-V10: переиспользуемый блок комментариев — список + форма добавления
 * (полиморфный API T-023). Подключён на карточках control/engagement/finding.
 */
export async function CommentsSection({
  entityType,
  entityId,
  path,
  comments,
  testid,
}: {
  entityType: string;
  entityId: string;
  /** путь для revalidatePath после добавления */
  path: string;
  comments: CommentItem[];
  testid: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('comments'), getLocale()]);
  const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section
      className="rounded-xl border border-border bg-white p-4 shadow-sm"
      data-testid={testid}
    >
      <h2 className="mb-3 text-sm font-semibold text-primary">{t('title')}</h2>
      {comments.length === 0 ? (
        <p className="text-sm text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c, i) => (
            <li key={i} className="rounded-lg bg-muted/60 p-3 text-sm">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">{c.author}</span>
                <span className="text-xs text-secondary tabular-nums">
                  {dateTimeFmt.format(new Date(c.at))}
                </span>
              </div>
              <p className="text-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        action={addEntityCommentAction.bind(null, entityType, entityId, path)}
        className="mt-3 flex items-start gap-2"
      >
        <textarea
          name="body"
          required
          rows={2}
          placeholder={t('placeholder')}
          className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground"
        />
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('add')}
        </button>
      </form>
    </section>
  );
}
