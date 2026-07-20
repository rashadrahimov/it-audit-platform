import { grantAccessAction, revokeAccessAction } from '@/lib/acl-actions';

export interface AclGrantRow {
  id: string;
  membershipId: string;
  level: string;
  fullName: string;
  email: string | null;
}
interface Member {
  id: string;
  fullName: string;
}

/**
 * T-V48 (ADR-0021): «Manage access» — панель per-entity ACL. Пусто → сущность видна
 * всему тенанту; хотя бы один грант → доступ ограничен (гранты + владелец + админ).
 * Переиспользуема для любой ACL-сущности (передаётся entityType/entityId/path).
 */
export function ManageAccessSection({
  entityType,
  entityId,
  path,
  grants,
  members,
  labels,
  testid = 'manage-access',
}: {
  entityType: string;
  entityId: string;
  path: string;
  grants: AclGrantRow[];
  members: Member[];
  labels: {
    title: string;
    openHint: string;
    restrictedHint: string;
    member: string;
    level: string;
    view: string;
    edit: string;
    grant: string;
    remove: string;
  };
  testid?: string;
}) {
  const grantedIds = new Set(grants.map((g) => g.membershipId));
  const grantable = members.filter((m) => !grantedIds.has(m.id));
  const restricted = grants.length > 0;

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      data-testid={testid}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-secondary">{labels.title}</h2>
        <span
          className={
            'rounded-full px-2 py-0.5 text-xs font-medium ' +
            (restricted ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')
          }
        >
          {restricted ? labels.restrictedHint : labels.openHint}
        </span>
      </div>

      {grants.length > 0 && (
        <ul className="flex flex-col gap-1.5" data-testid={`${testid}-list`}>
          {grants.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
            >
              <span className="text-foreground">
                {g.fullName}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-secondary">
                  {g.level === 'edit' ? labels.edit : labels.view}
                </span>
              </span>
              <form action={revokeAccessAction}>
                <input type="hidden" name="id" value={g.id} />
                <input type="hidden" name="path" value={path} />
                <button
                  type="submit"
                  data-testid={`${testid}-remove-${g.membershipId}`}
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-xs text-secondary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {labels.remove}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {grantable.length > 0 && (
        <form
          action={grantAccessAction}
          className="flex flex-wrap items-end gap-2"
          data-testid={`${testid}-form`}
        >
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="path" value={path} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{labels.member}</span>
            <select
              name="membershipId"
              required
              data-testid={`${testid}-member`}
              className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {grantable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{labels.level}</span>
            <select
              name="level"
              defaultValue="view"
              className="rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="view">{labels.view}</option>
              <option value="edit">{labels.edit}</option>
            </select>
          </label>
          <button
            type="submit"
            data-testid={`${testid}-grant`}
            className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {labels.grant}
          </button>
        </form>
      )}
    </section>
  );
}
