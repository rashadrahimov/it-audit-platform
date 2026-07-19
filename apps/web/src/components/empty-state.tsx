/**
 * Иллюстрированное пустое состояние (T-H32). Server-safe (чистый JSX). Иллюстрация —
 * инлайн-SVG «чеклист» в тонах темы (без внешних ассетов, on-prem-friendly).
 */
export function EmptyState({
  text,
  hint,
  size = 'md',
}: {
  text: string;
  hint?: string;
  size?: 'md' | 'sm';
}) {
  const svgSize = size === 'sm' ? 64 : 96;
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center ${
        size === 'sm' ? 'px-4 py-6' : 'px-6 py-10'
      }`}
    >
      <svg
        aria-hidden
        width={svgSize}
        height={svgSize}
        viewBox="0 0 96 96"
        fill="none"
        className="drop-shadow-sm"
      >
        {/* мягкий фон-блоб */}
        <circle cx="48" cy="50" r="38" className="fill-accent-soft" />
        <circle cx="76" cy="26" r="7" className="fill-accent-soft" opacity="0.7" />
        <circle cx="18" cy="30" r="4" className="fill-accent-soft" opacity="0.5" />
        {/* планшет */}
        <rect
          x="28"
          y="20"
          width="40"
          height="54"
          rx="6"
          className="fill-surface stroke-border"
          strokeWidth="2"
        />
        <rect
          x="40"
          y="15"
          width="16"
          height="9"
          rx="3.5"
          className="fill-muted stroke-border"
          strokeWidth="2"
        />
        {/* строки-чеклист */}
        <circle cx="38" cy="38" r="3" className="fill-accent" opacity="0.85" />
        <rect x="45" y="36" width="16" height="4" rx="2" className="fill-muted" />
        <circle cx="38" cy="50" r="3" className="fill-accent" opacity="0.55" />
        <rect x="45" y="48" width="12" height="4" rx="2" className="fill-muted" />
        <circle cx="38" cy="62" r="3" className="stroke-border fill-surface" strokeWidth="2" />
        <rect x="45" y="60" width="14" height="4" rx="2" className="fill-muted" />
        {/* искра */}
        <path
          d="M74 56l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6 1.6-4z"
          className="fill-accent"
          opacity="0.6"
        />
      </svg>
      <p className="text-sm font-medium text-foreground">{text}</p>
      {hint && <p className="max-w-xs text-xs text-secondary">{hint}</p>}
    </div>
  );
}
