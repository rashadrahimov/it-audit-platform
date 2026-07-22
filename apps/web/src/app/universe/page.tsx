import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import { getCurrentLocale } from '@/lib/locale';
import { EmptyState } from '@/components/empty-state';
import {
  createUniverseNodeAction,
  deleteUniverseNodeAction,
  moveUniverseNodeAction,
  updateUniverseNodeAction,
} from './actions';

export const dynamic = 'force-dynamic';

type NodeKind = 'subsidiary' | 'process' | 'system' | 'location' | 'activity' | 'function';

interface I18nText {
  en: string;
  az?: string;
  ru?: string;
}

interface UniverseNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  nameI18n: I18nText;
  ownerMembershipId: string | null;
  refId: string | null;
}

interface TreeNode extends UniverseNode {
  children: TreeNode[];
}

/** Оттенок бейджа по типу узла — семантика видна не только цветом (текст-метка тоже есть). */
const KIND_BADGE: Record<NodeKind, string> = {
  subsidiary: 'bg-accent/10 text-accent',
  process: 'bg-emerald-100 text-emerald-700',
  system: 'bg-violet-100 text-violet-700',
  location: 'bg-amber-100 text-amber-700',
  activity: 'bg-emerald-100 text-emerald-700',
  function: 'bg-muted text-secondary',
};
const NODE_KINDS: NodeKind[] = [
  'subsidiary',
  'process',
  'system',
  'location',
  'activity',
  'function',
];
const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const buttonCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function buildTree(nodes: UniverseNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function resolveName(name: I18nText, locale: string): string {
  return (name as unknown as Record<string, string | undefined>)[locale] ?? name.en;
}

/** Audit Universe (T-065): дерево auditable_entity под готовый API. */
export default async function UniversePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, locale, tenantSlug] = await Promise.all([
    getTranslations('universe'),
    getCurrentLocale(),
    getActiveTenantSlug(),
  ]);

  const res = await apiFetch('/universe', {
    headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {},
  });
  const nodes: UniverseNode[] = res.ok ? await res.json() : [];
  const tree = buildTree(nodes);

  const renderNode = (node: TreeNode, depth: number) => (
    <li key={node.id}>
      <div
        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-muted/60"
        style={{ marginInlineStart: depth * 20 }}
      >
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
        <span className="font-medium text-foreground">{resolveName(node.nameI18n, locale)}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${KIND_BADGE[node.kind] ?? KIND_BADGE.function}`}
        >
          {t(`kind.${node.kind}`)}
        </span>
        <details className="ms-auto">
          <summary className="cursor-pointer text-xs font-medium text-accent">{t('move')}</summary>
          <form
            action={moveUniverseNodeAction.bind(null, node.id)}
            className="mt-2 flex items-end gap-2"
          >
            <select
              name="parentId"
              defaultValue={node.parentId ?? ''}
              aria-label={t('parent')}
              className={inputCls}
            >
              <option value="">{t('root')}</option>
              {nodes
                .filter((candidate) => candidate.id !== node.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {resolveName(candidate.nameI18n, locale)}
                  </option>
                ))}
            </select>
            <button className={buttonCls}>{t('moveSave')}</button>
          </form>
        </details>
        <details>
          <summary className="cursor-pointer text-xs font-medium text-accent">{t('edit')}</summary>
          <form
            action={updateUniverseNodeAction.bind(null, node.id)}
            className="mt-2 grid min-w-64 gap-2"
          >
            <input
              name="name"
              required
              defaultValue={resolveName(node.nameI18n, locale)}
              className={inputCls}
            />
            <select name="kind" defaultValue={node.kind} className={inputCls}>
              {NODE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`kind.${kind}`)}
                </option>
              ))}
            </select>
            <button className={buttonCls}>{t('editSave')}</button>
          </form>
          <form action={deleteUniverseNodeAction.bind(null, node.id)} className="mt-2">
            <button className="text-xs font-medium text-red-700 hover:underline">
              {t('delete')}
            </button>
          </form>
        </details>
      </div>
      {node.children.length > 0 && (
        <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
      )}
    </li>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      <p className="text-sm text-secondary">
        {nodes.length} {t('nodes')}
      </p>

      <section className="flex flex-col gap-3" data-testid="universe-create">
        <h2 className="text-sm font-semibold text-secondary">{t('create')}</h2>
        <form
          action={createUniverseNodeAction}
          className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm sm:grid-cols-3"
        >
          <input name="name" required placeholder={t('name')} className={inputCls} />
          <select name="kind" defaultValue="process" className={inputCls}>
            {NODE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`kind.${kind}`)}
              </option>
            ))}
          </select>
          <select name="parentId" defaultValue="" className={inputCls}>
            <option value="">{t('root')}</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {resolveName(node.nameI18n, locale)}
              </option>
            ))}
          </select>
          <button className={`${buttonCls} sm:justify-self-start`}>{t('createButton')}</button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-white p-3 shadow-sm">
        {tree.length === 0 ? (
          <EmptyState size="sm" text={t('empty')} />
        ) : (
          <ul data-testid="universe-tree">{tree.map((node) => renderNode(node, 0))}</ul>
        )}
      </section>
    </main>
  );
}
