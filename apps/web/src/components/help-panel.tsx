'use client';

import Link from 'next/link';

export interface HelpEntry {
  title: string;
  summary: string;
  steps: string[];
}
export interface HelpLabels {
  title: string;
  howTo: string;
  current: string;
  startTour: string;
  openGuide: string;
  close: string;
}

/**
 * Контекстный справочник (T-H35): панель справа — что такое текущий раздел и как им
 * пользоваться (по каждому разделу отдельно). Открывается кнопкой «?» в топ-баре.
 */
export function HelpPanel({
  entry,
  labels,
  open,
  onClose,
  onStartTour,
}: {
  entry: HelpEntry;
  labels: HelpLabels;
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[65]">
      {/* фон */}
      <button
        aria-label={labels.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/30 backdrop-blur-[1px]"
      />
      {/* панель */}
      <aside
        data-testid="help-panel"
        className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-6 shadow-lg"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wider text-secondary uppercase">
            {labels.title}
          </p>
          <button
            type="button"
            aria-label={labels.close}
            onClick={onClose}
            data-testid="help-close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-secondary transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              className="h-4.5 w-4.5"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* текущий раздел */}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-secondary">{labels.current}</p>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{entry.title}</h2>
          <p className="text-sm leading-relaxed text-secondary">{entry.summary}</p>
        </div>

        {/* как пользоваться */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold tracking-wider text-secondary uppercase">
            {labels.howTo}
          </p>
          <ol className="flex flex-col gap-2.5">
            {entry.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent"
                >
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <button
            type="button"
            data-testid="help-start-tour"
            onClick={onStartTour}
            className="cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {labels.startTour}
          </button>
          <Link
            href="/guide"
            onClick={onClose}
            data-testid="help-open-guide"
            className="rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium text-secondary transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {labels.openGuide}
          </Link>
        </div>
      </aside>
    </div>
  );
}
