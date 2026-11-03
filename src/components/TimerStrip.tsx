import type { ReactNode } from 'react';
import { useHue } from '../state/theme';
import { formatClock } from '../lib/format';
import { cx } from './ui';

/**
 * The face of a running timer: pulsing dot, metric name, "since 14:05" and the clock.
 * The pinned TimerBar adds Stop; the admin view shows it as is, with nothing to press.
 */
export function TimerStrip({
  name,
  color,
  since,
  elapsed,
  action,
  className,
}: {
  name: string;
  color: string;
  since: string;
  elapsed: number;
  action?: ReactNode;
  className?: string;
}) {
  const hue = useHue(color);
  return (
    <div className={cx('relative flex items-center gap-3 overflow-hidden', className)}>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
        <span className="timer-sweep absolute inset-y-0 w-1/2" style={{ background: `linear-gradient(90deg, transparent, ${hue}, transparent)` }} />
      </span>
      <span aria-hidden className="timer-dot size-2.5 shrink-0 rounded-full" style={{ background: hue }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{name}</div>
        <div className="text-[12px] text-ink-3">since {since}</div>
      </div>
      <span className="text-[26px] font-medium leading-none tracking-tight" aria-live="off">
        {formatClock(Math.max(0, elapsed))}
      </span>
      {elapsed < 0 && <span className="sr-only">Clock difference detected</span>}
      {action}
    </div>
  );
}
