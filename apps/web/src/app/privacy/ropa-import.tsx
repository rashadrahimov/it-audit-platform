'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { importRopaAction, type RopaImportState } from './actions';

const init: RopaImportState = {};

/** T-V55: импорт реестра ROPA из CSV → сводка imported/skipped + ошибки построчно. */
export function RopaImport() {
  const t = useTranslations('privacy');
  const [state, action] = useActionState(importRopaAction, init);
  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      data-testid="ropa-import"
    >
      <h2 className="text-sm font-semibold text-primary">{t('importTitle')}</h2>
      <p className="text-xs text-secondary">{t('importHint')}</p>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          data-testid="ropa-import-file"
          className="text-sm text-secondary"
        />
        <button
          type="submit"
          data-testid="ropa-import-submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t('importBtn')}
        </button>
      </form>
      {state.error && <p className="text-sm text-destructive">{t('importFail')}</p>}
      {state.imported !== undefined && (
        <div data-testid="ropa-import-result" className="text-sm text-foreground">
          <p className="font-medium text-emerald-700">
            {t('importDone', { imported: state.imported, skipped: state.skipped ?? 0 })}
          </p>
          {state.errors && state.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-secondary">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
