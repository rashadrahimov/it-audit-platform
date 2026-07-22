import { attachTagAction, detachTagAction } from '@/lib/tag-actions';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

/**
 * T-V36d: переиспользуемая секция тегов сущности — навешивание из справочника
 * тенанта + снятие. Server-first (без клиентского JS).
 */
export function TagsSection({
  entityType,
  entityId,
  path,
  current,
  all,
  labels,
  testid,
}: {
  entityType: string;
  entityId: string;
  path: string;
  current: Tag[];
  all: Tag[];
  labels: { title: string; add: string; none: string; attach: string; remove: string };
  testid?: string;
}) {
  const currentIds = new Set(current.map((t) => t.id));
  const addable = all.filter((t) => !currentIds.has(t.id));
  return (
    <section
      data-testid={testid}
      className="rounded-xl border border-border bg-white p-6 shadow-sm"
    >
      <h2 className="mb-3 text-sm font-semibold text-primary">{labels.title}</h2>
      <div className="flex flex-wrap items-center gap-2">
        {current.length === 0 && <span className="text-sm text-secondary">{labels.none}</span>}
        {current.map((tg) => (
          <span
            key={tg.id}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: tg.color ? `${tg.color}22` : undefined,
              color: tg.color ?? undefined,
            }}
          >
            <span className={tg.color ? '' : 'text-secondary'}>{tg.name}</span>
            <form action={detachTagAction.bind(null, tg.id, entityType, entityId, path)}>
              <button
                type="submit"
                data-testid={`detach-tag-${tg.id}`}
                aria-label={`${labels.remove}: ${tg.name}`}
                className="text-secondary transition-colors duration-150 hover:text-foreground"
              >
                ✕
              </button>
            </form>
          </span>
        ))}
      </div>
      {addable.length > 0 && (
        <form
          action={attachTagAction.bind(null, entityType, entityId, path)}
          data-testid="tag-attach"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <select
            name="tagId"
            defaultValue=""
            className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground"
          >
            <option value="" disabled>
              {labels.add}
            </option>
            {addable.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-secondary transition-colors duration-150 hover:bg-muted"
          >
            {labels.attach}
          </button>
        </form>
      )}
    </section>
  );
}
