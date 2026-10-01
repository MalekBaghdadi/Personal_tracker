import { inputClass } from './ui';

export function parseDuration(hours: string, minutes: string): number {
  const h = hours.trim() === '' ? 0 : Number(hours);
  const m = minutes.trim() === '' ? 0 : Number(minutes);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return Math.round(h * 3600 + m * 60);
}

export function splitDuration(seconds: number): { hours: string; minutes: string } {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return { hours: h ? String(h) : '', minutes: m ? String(m) : '' };
}

export function DurationInput({
  hours,
  minutes,
  onHours,
  onMinutes,
  autoFocus,
  idPrefix = 'dur',
}: {
  hours: string;
  minutes: string;
  onHours: (v: string) => void;
  onMinutes: (v: string) => void;
  autoFocus?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          id={`${idPrefix}-h`}
          aria-label="Hours"
          className={`${inputClass} pr-10 text-[20px] font-medium`}
          inputMode="numeric"
          type="number"
          min={0}
          placeholder="0"
          value={hours}
          onChange={(e) => onHours(e.target.value)}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[14px] text-ink-3">h</span>
      </div>
      <div className="relative flex-1">
        <input
          id={`${idPrefix}-m`}
          aria-label="Minutes"
          className={`${inputClass} pr-12 text-[20px] font-medium`}
          inputMode="numeric"
          type="number"
          min={0}
          placeholder="0"
          autoFocus={autoFocus}
          value={minutes}
          onChange={(e) => onMinutes(e.target.value)}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[14px] text-ink-3">min</span>
      </div>
    </div>
  );
}

export function CountInput({
  value,
  onChange,
  unit,
  autoFocus,
  id = 'count',
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  autoFocus?: boolean;
  id?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        aria-label={`Amount in ${unit}`}
        className={`${inputClass} pr-16 text-[20px] font-medium`}
        inputMode="numeric"
        type="number"
        min={1}
        step={1}
        placeholder="0"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[14px] text-ink-3">{unit}</span>
    </div>
  );
}

/** Parse a count field; integers only (§5). */
export function parseCount(v: string): number {
  if (v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}
