import type { Metric } from './types';

const nf = new Intl.NumberFormat('en-US');

/** Seconds → "1h 25m", "45m", "40s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return '0m';
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Seconds → "1:05:09" / "5:09" for a running clock. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const days = (n: number) => `${nf.format(n)} ${n === 1 ? 'day' : 'days'}`;

/** A check metric's value is days done (1 on a single day, more over a week or month). */
export function formatValue(metric: Pick<Metric, 'type' | 'unit'>, value: number): string {
  if (metric.type === 'check') return days(value);
  return metric.type === 'duration' ? formatDuration(value) : `${nf.format(value)} ${metric.unit}`;
}

/** "1,800–2,200 kcal", "1h–2h": a range target's two ends with one unit. */
export function formatRange(metric: Pick<Metric, 'type' | 'unit'>, min: number, max: number): string {
  if (metric.type === 'duration') return `${formatDuration(min)}–${formatDuration(max)}`;
  return `${nf.format(min)}–${nf.format(max)} ${metric.unit}`;
}

/** "at least 1h", "at most 2,000 kcal", "1,800–2,200 kcal", "check off". Null when there's no target. */
export function formatTarget(metric: Pick<Metric, 'type' | 'unit' | 'target' | 'targetDirection' | 'targetMin'>): string | null {
  if (metric.type === 'check') return 'check off';
  if (metric.target == null) return null;
  if (metric.targetDirection === 'between') return formatRange(metric, metric.targetMin ?? 0, metric.target);
  return `${metric.targetDirection === 'at_most' ? 'at most' : 'at least'} ${formatValue(metric, metric.target)}`;
}

/** Value without unit, for big numerals; the unit is rendered separately. */
export function formatValueParts(metric: Pick<Metric, 'type' | 'unit'>, value: number): { num: string; unit: string } {
  if (metric.type === 'duration') return { num: formatDuration(value), unit: '' };
  if (metric.type === 'check') return { num: nf.format(value), unit: value === 1 ? 'day' : 'days' };
  return { num: nf.format(value), unit: metric.unit };
}

/** Compact label for quick-add chips, signed by the row's +/− toggle. */
export function formatChip(metric: Pick<Metric, 'type' | 'unit'>, value: number, sign: '+' | '−' = '+'): string {
  return `${sign}${metric.type === 'duration' ? formatDuration(value) : nf.format(value)}`;
}

export function formatNumber(n: number): string {
  return nf.format(n);
}
