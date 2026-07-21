import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'high' | 'critical';

const TONE: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-secondary',
  info: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  success: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  warning: 'border-amber-200 bg-amber-100 text-amber-800',
  high: 'border-orange-200 bg-orange-100 text-orange-800',
  critical: 'border-red-200 bg-red-100 text-red-800',
};

/** Единый семантический бейдж: цвет всегда дополнен текстовой меткой. */
export function StatusBadge({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: {
  children: ReactNode;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
