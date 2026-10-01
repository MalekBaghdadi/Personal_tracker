import { useHue } from '../state/theme';
import { cx } from './ui';
import type { Metric } from '../lib/types';

export function MetricPicker({ metrics, value, onChange }: { metrics: Metric[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Metric" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {metrics.map((m) => (
        <Chip key={m.id} metric={m} selected={m.id === value} onClick={() => onChange(m.id)} />
      ))}
    </div>
  );
}

function Chip({ metric, selected, onClick }: { metric: Metric; selected: boolean; onClick: () => void }) {
  const hue = useHue(metric.color);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-[14px] font-medium',
        selected ? 'bg-s3 text-ink' : 'bg-s1 text-ink-2 hover:text-ink',
      )}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ background: hue }} />
      {metric.name}
      {metric.archivedAt && <span className="text-[12px] text-ink-3">archived</span>}
    </button>
  );
}
