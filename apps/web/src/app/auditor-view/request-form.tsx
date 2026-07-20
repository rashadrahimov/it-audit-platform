'use client';

import { useActionState } from 'react';
import { createRequestAction, type FormState } from './actions';

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm transition-colors duration-150 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function RequestForm({
  engagementId,
  assignees,
  labels,
}: {
  engagementId: string;
  assignees: { id: string; name: string }[];
  labels: {
    title: string;
    titlePh: string;
    assignee: string;
    anyone: string;
    add: string;
    ok: string;
    error: string;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createRequestAction, {});
  return (
    <form
      action={formAction}
      data-testid="create-request"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
    >
      <input type="hidden" name="engagementId" value={engagementId} />
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="font-medium text-secondary">{labels.title}</span>
        <input name="title" required placeholder={labels.titlePh} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-secondary">{labels.assignee}</span>
        <select name="assigneeMembershipId" defaultValue="" className={inputCls}>
          <option value="">{labels.anyone}</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {labels.add}
      </button>
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {labels.error}
        </p>
      )}
      {state.ok && <p className="w-full text-sm text-emerald-700">{labels.ok}</p>}
    </form>
  );
}
