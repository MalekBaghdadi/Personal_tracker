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

export function formatValue(metric: Pick<Metric, 'type' | 'unit'>, value: number): string {
  return metric.type === 'duration' ? formatDuration(value) : `${nf.format(value)} ${metric.unit}`;
}

/** Value without unit, for big numerals; the unit is rendered separately. */
export function formatValueParts(metric: Pick<Metric, 'type' | 'unit'>, value: number): { num: string; unit: string } {
  if (metric.type === 'duration') return { num: formatDuration(value), unit: '' };
  return { num: nf.format(value), unit: metric.unit };
}

/** Compact label for quick-add chips, signed by the row's +/− toggle. */
export function formatChip(metric: Pick<Metric, 'type' | 'unit'>, value: number, sign: '+' | '−' = '+'): string {
  return `${sign}${metric.type === 'duration' ? formatDuration(value) : nf.format(value)}`;
}

export function formatNumber(n: number): string {
  return nf.format(n);
}
