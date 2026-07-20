'use client';

import { useActionState } from 'react';
import { inviteAuditorAction, type InviteAuditorState } from './actions';

interface Option {
  id: string;
  name: string;
}

interface Labels {
  email: string;
  emailPh: string;
  role: string;
  scope: string;
  scopeHint: string;
  add: string;
  ok: string;
  error: string;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm transition-colors duration-150 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function InviteAuditorForm({
  roles,
  subsidiaries,
  defaultRoleId,
  labels,
}: {
  roles: Option[];
  subsidiaries: Option[];
  defaultRoleId: string;
  labels: Labels;
}) {
  const [state, formAction, pending] = useActionState<InviteAuditorState, FormData>(
    inviteAuditorAction,
    {},
  );
  return (
    <form
      action={formAction}
      data-testid="invite-auditor"
      className="flex flex-col gap-4 rounded-xl border border-border bg-white p-5 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{labels.email}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder={labels.emailPh}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{labels.role}</span>
          <select name="roleId" defaultValue={defaultRoleId} className={inputCls}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-secondary">{labels.scope}</legend>
        <p className="text-xs text-secondary">{labels.scopeHint}</p>
        <div className="flex flex-wrap gap-3">
          {subsidiaries.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="subsidiaryScope"
                value={s.id}
                className="size-4 rounded border-border accent-accent"
              />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          {labels.add}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {labels.error}
          </p>
        )}
        {state.ok && (
          <p className="text-sm text-emerald-700">
            {labels.ok} {state.email}
          </p>
        )}
      </div>
    </form>
  );
}
