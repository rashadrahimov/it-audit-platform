/** T-V15: 4 слота конструктора виджетов (метрика + тип чарта + заголовок). */

const CHART_TYPES = ['bar', 'pie', 'donut', 'number', 'line'] as const;
const SLOTS = [0, 1, 2, 3];

const inputCls =
  'rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export interface SlotValue {
  metric: string;
  chartType: string;
  title?: string;
}

export function WidgetSlots({
  metrics,
  values,
  labels,
}: {
  metrics: string[];
  values?: SlotValue[];
  labels: {
    slot: string;
    metric: string;
    chartType: string;
    widgetTitle: string;
    none: string;
    metricLabel: (m: string) => string;
    chartLabel: (c: string) => string;
  };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SLOTS.map((i) => {
        const v = values?.[i];
        return (
          <fieldset
            key={i}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3"
            data-testid={`widget-slot-${i}`}
          >
            <legend className="px-1 text-xs font-medium text-secondary">
              {labels.slot} {i + 1}
            </legend>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-secondary">{labels.metric}</span>
              <select name={`metric${i}`} defaultValue={v?.metric ?? ''} className={inputCls}>
                <option value="">{labels.none}</option>
                {metrics.map((m) => (
                  <option key={m} value={m}>
                    {labels.metricLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-secondary">{labels.chartType}</span>
              <select
                name={`chartType${i}`}
                defaultValue={v?.chartType ?? 'bar'}
                className={inputCls}
              >
                {CHART_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {labels.chartLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-28 flex-1 flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-secondary">{labels.widgetTitle}</span>
              <input name={`title${i}`} defaultValue={v?.title ?? ''} className={inputCls} />
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}
