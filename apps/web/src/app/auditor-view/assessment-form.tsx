'use client';

import { useActionState } from 'react';
import { addAssessmentAction, type FormState } from './actions';

const inputCls =
  'rounded-md border border-border px-2 py-1 text-sm transition-colors duration-150 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export function AssessmentForm({
  findingId,
  verdicts,
  labels,
}: {
  findingId: string;
  verdicts: { value: string; label: string }[];
  labels: { notePh: string; add: string; error: string };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addAssessmentAction, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="targetId" value={findingId} />
      <select
        name="verdict"
        defaultValue={verdicts[0]?.value}
        aria-label={labels.add}
        className={inputCls}
      >
        {verdicts.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
      <input
        name="note"
        placeholder={labels.notePh}
        aria-label={labels.notePh}
        className={`flex-1 ${inputCls}`}
      />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        {labels.add}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-red-600">
          {labels.error}
        </span>
      )}
    </form>
  );
}
