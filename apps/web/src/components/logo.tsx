/**
 * Логотип STATERA (T-H37). Statera (лат.) — «весы, равновесие»: знак — равноплечные весы,
 * символ аудита, баланса и беспристрастности. Stroke-стиль под иконки платформы;
 * работает белым на navy-бейджах и тёмным на светлом фоне (currentColor).
 */
export function LogoMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {/* навершие */}
      <circle cx="12" cy="4" r="1.15" fill="currentColor" stroke="none" />
      {/* стойка и основание */}
      <path d="M12 5.4v14" />
      <path d="M8.6 19.4h6.8" />
      {/* коромысло — идеально ровное: равновесие */}
      <path d="M5 7.2h14" />
      {/* левая чаша */}
      <path d="M5 7.2l-2 4.4M5 7.2l2 4.4" />
      <path d="M3 11.6a2 2 0 004 0" />
      {/* правая чаша */}
      <path d="M19 7.2l-2 4.4M19 7.2l2 4.4" />
      <path d="M17 11.6a2 2 0 004 0" />
    </svg>
  );
}

/** Полный лок-ап: знак в navy-бейдже + словомарка STATERA. */
export function LogoLockup({ sub }: { sub?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-on-primary shadow-sm">
        <LogoMark className="h-5 w-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold tracking-[0.08em] text-foreground">
          STATERA
        </span>
        {sub && <span className="truncate text-xs text-secondary">{sub}</span>}
      </span>
    </span>
  );
}
