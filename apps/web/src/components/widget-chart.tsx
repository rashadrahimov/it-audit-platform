/**
 * T-V15: честный рендер виджета по chartType — bar (горизонтальные бары),
 * pie/donut (SVG-секторы), line (SVG-полилиния), number (крупное число).
 * Server-rendered, без клиентских библиотек.
 */

const KEY_TONE: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  non_compliant: '#dc2626',
  overdue: '#dc2626',
  fail: '#dc2626',
  medium: '#d97706',
  due_soon: '#d97706',
  low: '#059669',
  compliant: '#059669',
  ok: '#059669',
  pass: '#059669',
};
const PALETTE = ['#07865f', '#16a36a', '#84a83e', '#d97706', '#be123c', '#78716c', '#14532d'];
const colorOf = (key: string, i: number) => KEY_TONE[key] ?? PALETTE[i % PALETTE.length]!;

function PieSvg({
  entries,
  donut,
  ariaLabel,
}: {
  entries: Array<[string, number]>;
  donut: boolean;
  ariaLabel: string;
}) {
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const r = 45;
  const c = 50;
  let angle = -Math.PI / 2;
  const slices = entries.map(([key, value], i) => {
    const slice = (value / total) * Math.PI * 2;
    const end = angle + slice;
    const large = slice > Math.PI ? 1 : 0;
    const x1 = c + r * Math.cos(angle);
    const y1 = c + r * Math.sin(angle);
    const x2 = c + r * Math.cos(end);
    const y2 = c + r * Math.sin(end);
    // полный круг одной категорией — arc вырождается; рисуем circle
    const d =
      slice >= Math.PI * 2 - 0.001
        ? null
        : `M ${c} ${c} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    angle = end;
    return { key, d, fill: colorOf(key, i) };
  });
  return (
    <svg viewBox="0 0 100 100" className="size-24 shrink-0" role="img" aria-label={ariaLabel}>
      {slices.map((s) =>
        s.d ? (
          <path key={s.key} d={s.d} fill={s.fill} />
        ) : (
          <circle key={s.key} cx={c} cy={c} r={r} fill={s.fill} />
        ),
      )}
      {donut && <circle cx={c} cy={c} r={r * 0.55} fill="white" />}
    </svg>
  );
}

function LineSvg({ entries, ariaLabel }: { entries: Array<[string, number]>; ariaLabel: string }) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const w = 200;
  const h = 60;
  const step = entries.length > 1 ? w / (entries.length - 1) : 0;
  const points = entries.map(([, v], i) => `${i * step},${h - (v / max) * (h - 6) - 3}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" role="img" aria-label={ariaLabel}>
      <polyline points={points} fill="none" stroke="#07865f" strokeWidth="2" />
      {entries.map(([key, v], i) => (
        <circle key={key} cx={i * step} cy={h - (v / max) * (h - 6) - 3} r="2.5" fill="#07865f" />
      ))}
    </svg>
  );
}

export function WidgetChart({
  chartType,
  data,
  ariaLabel,
}: {
  chartType: string;
  data: Record<string, number>;
  ariaLabel: string;
}) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="text-sm text-secondary">—</p>;

  if (chartType === 'number') {
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return (
      <div>
        <p className="text-3xl font-bold text-primary tabular-nums">{total}</p>
        <p className="mt-1 text-xs text-secondary">
          {entries.map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </p>
      </div>
    );
  }

  if (chartType === 'pie' || chartType === 'donut') {
    return (
      <div className="flex items-center gap-4">
        <PieSvg entries={entries} donut={chartType === 'donut'} ariaLabel={ariaLabel} />
        <ul className="flex flex-col gap-1 text-xs">
          {entries.map(([key, value], i) => (
            <li key={key} className="flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: colorOf(key, i) }}
              />
              <span className="text-foreground">{key}</span>
              <span className="font-medium tabular-nums text-foreground">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (chartType === 'line') {
    return (
      <div>
        <LineSvg entries={entries} ariaLabel={ariaLabel} />
        <p className="mt-1 text-xs text-secondary">
          {entries.map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </p>
      </div>
    );
  }

  // bar (дефолт)
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <ul className="flex flex-col gap-2">
      {entries.map(([key, value], i) => (
        <li key={key} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-foreground" title={key}>
            {key}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(value / max) * 100}%`, backgroundColor: colorOf(key, i) }}
            />
          </span>
          <span className="w-8 shrink-0 text-right font-medium tabular-nums text-foreground">
            {value}
          </span>
        </li>
      ))}
    </ul>
  );
}
