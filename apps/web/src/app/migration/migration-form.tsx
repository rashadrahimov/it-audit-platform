'use client';

import { useActionState } from 'react';
import { processChecklistAction, type MigrationState } from './actions';

interface Labels {
  file: string;
  preview: string;
  import: string;
  parsed: string;
  ref: string;
  domain: string;
  compliance: string;
  risk: string;
  imported: string;
  domains: string;
  controls: string;
  skipped: string;
  errorFile: string;
  errorApi: string;
}

const btn =
  'rounded-md px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Загрузка чеклист-шаблона: preview/import через useActionState (файл без навигации). */
export function MigrationForm({ labels }: { labels: Labels }) {
  const [state, formAction, pending] = useActionState<MigrationState, FormData>(
    processChecklistAction,
    {},
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        action={formAction}
        data-testid="migration-form"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      >
        <label className="flex flex-1 flex-col gap-1 text-xs text-secondary">
          {labels.file}
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
        </label>
        <button
          type="submit"
          name="mode"
          value="preview"
          disabled={pending}
          className={`${btn} border border-border text-secondary hover:bg-muted disabled:opacity-60`}
        >
          {labels.preview}
        </button>
        <button
          type="submit"
          name="mode"
          value="import"
          disabled={pending}
          className={`${btn} bg-accent text-on-primary hover:bg-accent/90 disabled:opacity-60`}
        >
          {labels.import}
        </button>
      </form>

      {state.error === 'no-file' && <p className="text-sm text-red-600">{labels.errorFile}</p>}
      {state.error?.startsWith('api-') && <p className="text-sm text-red-600">{labels.errorApi}</p>}

      {state.mode === 'import' && state.imported && (
        <section
          data-testid="migration-imported"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {labels.imported}: {labels.domains} {state.imported.domains}, {labels.controls}{' '}
          {state.imported.controls}, {labels.skipped} {state.imported.skipped}
        </section>
      )}

      {state.mode === 'preview' && state.rows && (
        <section
          className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm"
          data-testid="migration-preview"
        >
          <p className="border-b border-border px-4 py-2 text-sm text-secondary">
            {labels.parsed}: <span className="font-semibold text-foreground">{state.count}</span>
          </p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-secondary">
                <th className="px-4 py-2 font-medium">{labels.ref}</th>
                <th className="px-4 py-2 font-medium">{labels.domain}</th>
                <th className="px-4 py-2 font-medium">{labels.compliance}</th>
                <th className="px-4 py-2 font-medium">{labels.risk}</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.slice(0, 50).map((r) => (
                <tr key={r.ref} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{r.ref}</td>
                  <td className="px-4 py-2 text-secondary">{r.domain ?? '—'}</td>
                  <td className="px-4 py-2 text-secondary">{r.complianceStatus ?? '—'}</td>
                  <td className="px-4 py-2 text-secondary">{r.riskRating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
