import { useState } from 'react';
import { Archive, ArchiveRestore, Flag, Trash2 } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useTheme } from '../state/theme';
import { deleteMetric, saveMetric, setArchived } from '../lib/repo';
import { uuid } from '../lib/device';
import { nowIso } from '../lib/dates';
import { ICONS } from '../lib/icons';
import { PALETTE, hueFor } from '../lib/palette';
import { formatNumber } from '../lib/format';
import { Button, DayPicker, FieldError, Label, Segmented, Sheet, Switch, cx, inputClass, useToast } from './ui';
import { CountInput, DurationInput, parseCount, parseDuration, splitDuration } from './inputs';
import type { Metric, MetricType, Schedule, TargetDirection } from '../lib/types';

export function MetricEditor({ target, onClose, onGoal }: { target: Metric | 'new' | null; onClose: () => void; onGoal?: (metricId: string) => void }) {
  const title = target === 'new' ? 'New metric' : target ? `Edit ${target.name}` : '';
  return (
    <Sheet open={target !== null} onClose={onClose} title={title}>
      {target && <Form key={target === 'new' ? 'new' : target.id} initial={target === 'new' ? null : target} onDone={onClose} onGoal={onGoal} />}
    </Sheet>
  );
}

function quickAddToText(m: Pick<Metric, 'type' | 'quickAdd'>): string {
  return m.quickAdd.map((v) => (m.type === 'duration' ? Math.round(v / 60) : v)).join(', ');
}

function Form({ initial, onDone, onGoal }: { initial: Metric | null; onDone: () => void; onGoal?: (metricId: string) => void }) {
  const { uid, metrics, entries, timer, settings, goals } = useData();
  const theme = useTheme();
  const toast = useToast();

  const usedColors = new Set(metrics.map((m) => m.color.toLowerCase()));
  const defaultColor = (PALETTE.find((p) => !usedColors.has(p.dark.toLowerCase())) ?? PALETTE[metrics.length % PALETTE.length]).dark;

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<MetricType>(initial?.type ?? 'duration');
  const [unit, setUnit] = useState(initial?.type === 'count' ? initial.unit : '');
  const [direction, setDirection] = useState<TargetDirection>(initial?.targetDirection ?? 'at_least');
  const tSplit = initial?.target != null && initial.type === 'duration' ? splitDuration(initial.target) : { hours: '', minutes: '' };
  const [tHours, setTHours] = useState(tSplit.hours);
  const [tMinutes, setTMinutes] = useState(tSplit.minutes);
  const [tCount, setTCount] = useState(initial?.target != null && initial.type === 'count' ? String(initial.target) : '');
  const [schedule, setSchedule] = useState<Schedule>(initial?.schedule ?? { kind: 'daily' });
  const [timerEnabled, setTimerEnabled] = useState(initial?.timerEnabled ?? true);
  const [restPerWeek, setRestPerWeek] = useState(initial?.restDaysPerWeek ?? 0);
  // At least one due day a week has to stay; offer up to 3.
  const dueDaysPerWeek = schedule.kind === 'daily' ? 7 : schedule.days.length;
  const maxRest = Math.max(0, Math.min(3, dueDaysPerWeek - 1));
  const [quick, setQuick] = useState(initial ? quickAddToText(initial) : '15, 30, 60');
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [icon, setIcon] = useState(initial?.icon ?? 'Target');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entryIds = initial ? entries.filter((e) => e.metricId === initial.id).map((e) => e.id) : [];
  const goalIds = initial ? goals.filter((g) => g.metricId === initial.id).map((g) => g.id) : [];
  const activeGoal = initial ? goals.find((g) => g.metricId === initial.id && !g.archivedAt) : undefined;

  const changeType = (t: MetricType) => {
    if (t === type) return;
    setType(t);
    setQuick(t === 'duration' ? '15, 30, 60' : '1, 5, 10');
    if (t === 'count') setTimerEnabled(false);
  };

  const save = () => {
    const errs: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) errs.name = 'Give it a name.';
    if (type === 'count' && !unit.trim()) errs.unit = 'Name the unit, such as kcal or pages.';

    let target: number | null = null;
    if (type === 'duration') {
      if (tHours.trim() || tMinutes.trim()) {
        target = parseDuration(tHours, tMinutes);
        if (!(target > 0)) errs.target = 'Enter a target above zero, or leave both blank for none.';
      }
    } else if (tCount.trim()) {
      target = parseCount(tCount);
      if (!(target > 0)) errs.target = 'Enter a whole number above zero, or leave blank for none.';
    }

    const parts = quick.split(/[,\s]+/).filter(Boolean);
    const quickAdd = parts.map(Number);
    if (quickAdd.some((v) => !Number.isFinite(v) || v <= 0 || (type === 'count' && !Number.isInteger(v)))) {
      errs.quick = 'Use positive numbers separated by commas.';
    } else if (quickAdd.length > 5) errs.quick = 'Up to five buttons.';

    if (schedule.kind === 'days_of_week' && schedule.days.length === 0) errs.schedule = 'Pick at least one day, or choose every day.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const now = nowIso();
    const metric: Metric = {
      id: initial?.id ?? uuid(),
      name: trimmed,
      type,
      unit: type === 'duration' ? 'min' : unit.trim(),
      target,
      targetDirection: direction,
      schedule,
      timerEnabled: type === 'duration' && timerEnabled,
      restDaysPerWeek: Math.min(restPerWeek, maxRest),
      // Marks are set from Today; keep the live list rather than this form's copy.
      restDates: metrics.find((m) => m.id === initial?.id)?.restDates ?? [],
      quickAdd: [...new Set(quickAdd.map((v) => (type === 'duration' ? Math.round(v * 60) : v)))].sort((a, b) => a - b),
      color,
      icon,
      order: initial?.order ?? metrics.reduce((max, m) => Math.max(max, m.order + 1), 0),
      archivedAt: initial?.archivedAt ?? null,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    saveMetric(uid, metric);
    toast(initial ? `Saved ${metric.name}` : `${metric.name} is ready on Today`);
    onDone();
  };

  if (confirmDelete && initial) {
    const n = entryIds.length;
    const g = goalIds.length;
    const parts = [
      ...(n > 0 ? [`${formatNumber(n)} ${n === 1 ? 'entry' : 'entries'}`] : []),
      ...(g > 0 ? [`${g} deadline ${g === 1 ? 'goal' : 'goals'}`] : []),
    ];
    return (
      <div className="mt-2">
        <p className="text-[15px] text-ink-2">
          This removes {initial.name}
          {parts.length ? <> and its <strong className="text-ink">{parts.join(' and ')}</strong></> : ', which has no entries,'} from the app.
          To hide it but keep its history, archive it instead.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant="danger"
            onClick={() => {
              deleteMetric(uid, initial.id, entryIds, timer?.metricId === initial.id ? timer : null, goalIds);
              toast(`Deleted ${initial.name}`);
              onDone();
            }}
          >
            Delete {initial.name}{parts.length ? ` and ${parts.join(' and ')}` : ''}
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="mt-2 flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <Label htmlFor="m-name">Name</Label>
        <input id="m-name" className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Guitar practice" autoFocus={!initial} />
        <FieldError>{errors.name}</FieldError>
      </div>

      <div>
        <Label>Measured as</Label>
        {entryIds.length > 0 ? (
          // Stored values are seconds or plain numbers; switching would misread history.
          <p className="text-[15px]">
            {type === 'duration' ? 'Time' : 'A number'}
            <span className="block text-[13px] text-ink-3">Fixed once entries exist.</span>
          </p>
        ) : (
          <Segmented label="Measured as" value={type} onChange={changeType} options={[{ value: 'duration', label: 'Time' }, { value: 'count', label: 'A number' }]} />
        )}
      </div>

      {type === 'count' && (
        <div>
          <Label htmlFor="m-unit">Unit</Label>
          <input id="m-unit" className={inputClass} value={unit} maxLength={12} onChange={(e) => setUnit(e.target.value)} placeholder="kcal, pages, glasses" />
          <FieldError>{errors.unit}</FieldError>
        </div>
      )}

      <div>
        <Label>Daily target</Label>
        <Segmented label="Target direction" value={direction} onChange={setDirection} options={[{ value: 'at_least', label: 'At least' }, { value: 'at_most', label: 'At most' }]} />
        <div className="mt-2">
          {type === 'duration' ? (
            <DurationInput idPrefix="m-target" hours={tHours} minutes={tMinutes} onHours={setTHours} onMinutes={setTMinutes} />
          ) : (
            <CountInput id="m-target" value={tCount} onChange={setTCount} unit={unit || 'units'} />
          )}
        </div>
        <FieldError>{errors.target}</FieldError>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {direction === 'at_most' ? 'A day counts only if you logged something and stayed at or under. ' : ''}
          Leave blank for no target. Changing a target recalculates past streaks against the new value.
        </p>
      </div>

      <div>
        <Label>Scheduled</Label>
        <Segmented
          label="Schedule"
          value={schedule.kind}
          onChange={(k) => setSchedule(k === 'daily' ? { kind: 'daily' } : { kind: 'days_of_week', days: schedule.kind === 'days_of_week' ? schedule.days : [1, 3, 5] })}
          options={[{ value: 'daily', label: 'Every day' }, { value: 'days_of_week', label: 'Some days' }]}
        />
        {schedule.kind === 'days_of_week' && (
          <div className="mt-2">
            <DayPicker days={schedule.days} weekStartsOn={settings?.weekStartsOn ?? 1} onChange={(days) => setSchedule({ kind: 'days_of_week', days })} />
          </div>
        )}
        <FieldError>{errors.schedule}</FieldError>
      </div>

      <div>
        <Label>Rest days a week</Label>
        <Segmented
          label="Rest days a week"
          value={Math.min(restPerWeek, maxRest)}
          onChange={setRestPerWeek}
          options={Array.from({ length: maxRest + 1 }, (_, n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))}
        />
        <p className="mt-1.5 text-[13px] text-ink-3">
          {restPerWeek > 0
            ? `Each week, ${restPerWeek === 1 ? 'one due day' : `${restPerWeek} due days`} can be skipped without breaking the streak. Tap Rest day on Today, or just don’t log it.`
            : 'Every due day counts toward the streak.'}
        </p>
      </div>

      {type === 'duration' && <Switch checked={timerEnabled} onChange={setTimerEnabled} label="Show a start/stop timer" />}

      <div>
        <Label htmlFor="m-quick">One-tap buttons ({type === 'duration' ? 'minutes' : unit || 'units'})</Label>
        <input id="m-quick" className={inputClass} inputMode="text" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="15, 30, 60" />
        <FieldError>{errors.quick}</FieldError>
      </div>

      <div>
        <Label>Colour</Label>
        <div className="flex flex-wrap items-center gap-2">
          {PALETTE.map((p) => (
            <button
              key={p.dark}
              type="button"
              aria-label={p.name}
              aria-pressed={color.toLowerCase() === p.dark.toLowerCase()}
              onClick={() => setColor(p.dark)}
              className={cx('press size-11 rounded-lg border-2', color.toLowerCase() === p.dark.toLowerCase() ? 'border-ink' : 'border-transparent')}
              style={{ background: theme === 'dark' ? p.dark : p.light }}
            />
          ))}
          <label className="relative inline-flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-line text-[11px] text-ink-3" title="Custom colour">
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom colour" />
            {PALETTE.some((p) => p.dark.toLowerCase() === color.toLowerCase()) ? 'Other' : <span className="size-6 rounded" style={{ background: hueFor(color, theme) }} />}
          </label>
        </div>
      </div>

      <div>
        <Label>Icon</Label>
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(ICONS).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={icon === key}
              onClick={() => setIcon(key)}
              className={cx('press flex aspect-square min-h-10 items-center justify-center rounded-lg', icon === key ? 'bg-s3 text-ink' : 'text-ink-3 hover:bg-s2 hover:text-ink')}
            >
              <Icon size={18} style={icon === key ? { color: hueFor(color, theme) } : undefined} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary">{initial ? 'Save changes' : 'Create metric'}</Button>
        {/* Goals need an at_least metric; a cumulative ceiling means nothing. */}
        {initial && initial.targetDirection === 'at_least' && onGoal && (
          activeGoal ? (
            <a href={`#/goals/${activeGoal.id}`} onClick={onDone} className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-s2 px-4 text-[15px] font-medium hover:bg-s3">
              <Flag size={17} /> View deadline goal
            </a>
          ) : (
            <Button onClick={() => onGoal(initial.id)}><Flag size={17} /> Add deadline goal</Button>
          )
        )}
        {initial && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                setArchived(uid, initial.id, !initial.archivedAt);
                toast(initial.archivedAt ? `${initial.name} is back on Today` : `Archived ${initial.name}`);
                onDone();
              }}
            >
              {initial.archivedAt ? <><ArchiveRestore size={17} /> Unarchive</> : <><Archive size={17} /> Archive</>}
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={17} /> Delete
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
