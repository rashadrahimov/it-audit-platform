'use client';

import { useActionState } from 'react';
import { createEngagementAction, type NewEngagementState } from './actions';

interface Option {
  id?: string;
  code?: string;
  name: string;
}

interface Labels {
  create: string;
  title: string;
  titlePh: string;
  subsidiary: string;
  auditType: string;
  none: string;
  mode: string;
  formal: string;
  light: string;
  periodStart: string;
  periodEnd: string;
  submit: string;
  error: string;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm transition-colors duration-150 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function NewEngagementForm({
  subsidiaries,
  auditTypes,
  labels,
}: {
  subsidiaries: Option[];
  auditTypes: Option[];
  labels: Labels;
}) {
  const [state, formAction, pending] = useActionState<NewEngagementState, FormData>(
    createEngagementAction,
    {},
  );
  return (
    <details className="rounded-xl border border-border bg-white shadow-sm">
      <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-secondary select-none">
        {labels.create}
      </summary>
      <form
        action={formAction}
        data-testid="create-engagement"
        className="flex flex-col gap-4 border-t border-border p-5"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-secondary">{labels.title}</span>
          <input name="title" required placeholder={labels.titlePh} className={inputCls} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{labels.subsidiary}</span>
            <select name="subsidiaryId" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                —
              </option>
              {subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{labels.auditType}</span>
            <select name="auditTypeCode" defaultValue="" className={inputCls}>
              <option value="">{labels.none}</option>
              {auditTypes.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{labels.mode}</span>
            <select name="mode" defaultValue="formal" className={inputCls}>
              <option value="formal">{labels.formal}</option>
              <option value="light">{labels.light}</option>
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{labels.periodStart}</span>
              <input type="date" name="periodStart" className={inputCls} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{labels.periodEnd}</span>
              <input type="date" name="periodEnd" className={inputCls} />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          >
            {labels.submit}
          </button>
          {state.error && (
            <p role="alert" className="text-sm text-red-600">
              {labels.error}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}
