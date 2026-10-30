import { useState } from 'react';
import { Archive, ArchiveRestore, Flag, Trash2 } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useCompete } from '../state/CompeteContext';
import { sideMetricIds } from '../lib/compete';
import { useTheme } from '../state/theme';
import { deleteMetric, saveMetric, setArchived } from '../lib/repo';
import { uuid } from '../lib/device';
import { formatLocalDate, nowIso } from '../lib/dates';
import { changeTarget, targetPeriods } from '../lib/targets';
import { ICONS } from '../lib/icons';
import { THEMES, themeFromIcon } from '../lib/themes';
import { BINDER_ICON } from '../lib/binderIcons';
import { PALETTE, hueFor } from '../lib/palette';
import { formatNumber, formatTarget } from '../lib/format';
import { Button, DayPicker, FieldError, Label, Segmented, Sheet, Switch, cx, inputClass, useToast } from './ui';
import { CountInput, DurationInput, parseCount, parseDuration, splitDuration } from './inputs';
import type { CarouselPace, CarouselStyle, Metric, MetricType, Schedule, TargetDirection, ThemeId } from '../lib/types';

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
  const { uid, metrics, entries, reviews, timer, settings, goals, today, dayOf } = useData();
  const theme = useTheme();
  const toast = useToast();

  const usedColors = new Set(metrics.map((m) => m.color.toLowerCase()));
  const defaultColor = (PALETTE.find((p) => !usedColors.has(p.dark.toLowerCase())) ?? PALETTE[metrics.length % PALETTE.length]).dark;

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<MetricType>(initial?.type ?? 'duration');
  const [unit, setUnit] = useState(initial?.type === 'count' ? initial.unit : '');
  const [direction, setDirection] = useState<TargetDirection>(initial?.type === 'check' ? 'at_least' : initial?.targetDirection ?? 'at_least');
  const tSplit = initial?.target != null && initial.type === 'duration' ? splitDuration(initial.target) : { hours: '', minutes: '' };
  const [tHours, setTHours] = useState(tSplit.hours);
  const [tMinutes, setTMinutes] = useState(tSplit.minutes);
  const [tCount, setTCount] = useState(initial?.target != null && (initial.type === 'count' || initial.type === 'phrase') ? String(initial.target) : '');
  // A range's lower end; the fields above are then its upper end.
  const minSplit = initial?.targetMin != null && initial.type === 'duration' ? splitDuration(initial.targetMin) : { hours: '', minutes: '' };
  const [minHours, setMinHours] = useState(minSplit.hours);
  const [minMinutes, setMinMinutes] = useState(minSplit.minutes);
  const [minCount, setMinCount] = useState(initial?.targetMin != null && initial.type === 'count' ? String(initial.targetMin) : '');
  // Editing the target of an existing metric asks from which day the new one applies; earlier days keep theirs.
  const targetKey = [direction, tHours, tMinutes, tCount, minHours, minMinutes, minCount].join('|');
  const [initialKey] = useState(targetKey);
  const targetEdited = !!initial && targetKey !== initialKey;
  const [applyFrom, setApplyFrom] = useState(today);
  const [schedule, setSchedule] = useState<Schedule>(initial?.schedule ?? { kind: 'daily' });
  const [timerEnabled, setTimerEnabled] = useState(initial?.timerEnabled ?? true);
  const [restPerWeek, setRestPerWeek] = useState(initial?.restDaysPerWeek ?? 0);
  // At least one due day a week has to stay; offer up to 3.
  const dueDaysPerWeek = schedule.kind === 'daily' ? 7 : schedule.days.length;
  const maxRest = Math.max(0, Math.min(3, dueDaysPerWeek - 1));
  const [quick, setQuick] = useState(initial ? quickAddToText(initial) : '15, 30, 60');
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [icon, setIcon] = useState(initial?.icon ?? 'Target');
  // Unset, the theme follows the icon (themeOf); picking one stores it.
  const [achTheme, setAchTheme] = useState<ThemeId | undefined>(initial?.theme);
  const shownTheme = achTheme ?? (type === 'phrase' ? 'wisdom' : themeFromIcon(icon));
  // Phrase metrics: cycle the collection on Today. Style and pace are remembered while it's switched off.
  const [carouselOn, setCarouselOn] = useState(!!initial?.carousel);
  const [carouselStyle, setCarouselStyle] = useState<CarouselStyle>(initial?.carousel?.style ?? 'fade');
  const [carouselPace, setCarouselPace] = useState<CarouselPace>(initial?.carousel?.pace ?? 'normal');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entryIds = initial ? entries.filter((e) => e.metricId === initial.id).map((e) => e.id) : [];
  const goalIds = initial ? goals.filter((g) => g.metricId === initial.id).map((g) => g.id) : [];
  const reviewIds = initial ? reviews.filter((r) => r.metricId === initial.id).map((r) => r.id) : [];
  const activeGoal = initial ? goals.find((g) => g.metricId === initial.id && !g.archivedAt) : undefined;
  // Compete races "at least" amounts (or time ranges) and goals add amounts up:
  // a check-off can be neither, and a range of counts can't be raced, so a
  // metric in use there can't become one.
  const { pair, links } = useCompete();
  const raced = !!initial && !!pair && !pair.endedAt && links.some((l) => !l.endedAt && sideMetricIds(l, uid).includes(initial.id));

  const changeType = (t: MetricType) => {
    if (t === type) return;
    setType(t);
    if (t !== 'check' && t !== 'phrase') setQuick(t === 'duration' ? '15, 30, 60' : '1, 5, 10');
    if (t !== 'duration') setTimerEnabled(false);
    if (t === 'phrase') {
      // A phrase metric asks for a number of phrases a day, at least; one is the usual start.
      setDirection('at_least');
      if (!tCount.trim()) setTCount('1');
      if (icon === 'Target') setIcon('Quote');
    } else if (icon === 'Quote' && !initial) setIcon('Target');
  };

  const save = () => {
    const errs: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) errs.name = 'Give it a name.';
    if (type === 'count' && !unit.trim()) errs.unit = 'Name the unit, such as kcal or pages.';
    const check = type === 'check';
    const phrase = type === 'phrase';
    const range = !check && !phrase && direction === 'between';

    // A check-off's target is always 1: the day is done or it isn't.
    let target: number | null = check ? 1 : null;
    let targetMin: number | null = null;
    if (check) {
      // Nothing to read.
    } else if (phrase) {
      target = parseCount(tCount);
      if (!(target > 0)) errs.target = 'Enter a whole number of phrases above zero.';
    } else if (type === 'duration') {
      if (tHours.trim() || tMinutes.trim()) {
        target = parseDuration(tHours, tMinutes);
        if (!(target > 0)) errs.target = 'Enter a target above zero, or leave both blank for none.';
      }
    } else if (tCount.trim()) {
      target = parseCount(tCount);
      if (!(target > 0)) errs.target = 'Enter a whole number above zero, or leave blank for none.';
    }
    if (range) {
      const lowGiven = type === 'duration' ? !!(minHours.trim() || minMinutes.trim()) : !!minCount.trim();
      if (lowGiven) targetMin = type === 'duration' ? parseDuration(minHours, minMinutes) : parseCount(minCount);
      if (!lowGiven || target == null) errs.target = 'Enter both ends of the range.';
      else if (!(targetMin! > 0)) errs.target = type === 'duration' ? 'Enter a lower end above zero.' : 'Enter whole numbers above zero.';
      else if (!(target > targetMin!)) errs.target = 'The upper end has to be more than the lower end.';
    }

    const parts = check || phrase ? [] : quick.split(/[,\s]+/).filter(Boolean);
    const quickAdd = parts.map(Number);
    if (quickAdd.some((v) => !Number.isFinite(v) || v <= 0 || (type === 'count' && !Number.isInteger(v)))) {
      errs.quick = 'Use positive numbers separated by commas.';
    } else if (quickAdd.length > 5) errs.quick = 'Up to five buttons.';
    if ((check || (range && type !== 'duration')) && raced) errs.target = 'This metric is in a Compete race, which needs an “at least” amount or a time range. Take it out of the race first.';
    if (initial && targetEdited && !check && !/^\d{4}-\d{2}-\d{2}$/.test(applyFrom)) errs.from = 'Pick the day the new target starts.';
    else if (initial && targetEdited && !check && applyFrom > today) errs.from = 'The new target can start today at the latest.';
    if (check && activeGoal) errs.target = 'This metric has a deadline goal, which adds up amounts. Archive the goal first.';

    if (schedule.kind === 'days_of_week' && schedule.days.length === 0) errs.schedule = 'Pick at least one day, or choose every day.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const now = nowIso();
    const nextTarget = { target, targetDirection: check || phrase ? 'at_least' as const : direction, targetMin };
    // Days before the chosen one keep the target they had. A check-off's target is always 1, so it replaces the old amounts outright.
    const firstDay = initial ? entries.reduce((min, e) => (e.metricId === initial.id && e.localDate < min ? e.localDate : min), dayOf(initial.createdAt)) : today;
    const targetFields = initial && (targetEdited || (check && initial.type !== 'check'))
      ? changeTarget(initial, nextTarget, check ? firstDay : applyFrom, firstDay)
      : { ...nextTarget, ...(initial?.targetHistory?.length ? { targetHistory: initial.targetHistory, targetFrom: initial.targetFrom ?? null } : {}) };
    const metric: Metric = {
      id: initial?.id ?? uuid(),
      name: trimmed,
      type,
      unit: type === 'duration' ? 'min' : check ? 'days' : phrase ? 'phrases' : unit.trim(),
      ...targetFields,
      schedule,
      timerEnabled: type === 'duration' && timerEnabled,
      restDaysPerWeek: Math.min(restPerWeek, maxRest),
      // Marks are set from Today; keep the live list rather than this form's copy.
      restDates: metrics.find((m) => m.id === initial?.id)?.restDates ?? [],
      quickAdd: [...new Set(quickAdd.map((v) => (type === 'duration' ? Math.round(v * 60) : v)))].sort((a, b) => a - b),
      color,
      icon,
      // A phrase metric is linked to the Phrases binder up front, so changing its icon later never drops it.
      ...(achTheme ? { theme: achTheme } : phrase ? { theme: 'wisdom' as const } : {}),
      ...(phrase && carouselOn ? { carousel: { style: carouselStyle, pace: carouselPace } } : {}),
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
      ...(n > 0 ? [`${formatNumber(n)} ${initial.type === 'phrase' ? (n === 1 ? 'phrase' : 'phrases') : n === 1 ? 'entry' : 'entries'}`] : []),
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
              deleteMetric(uid, initial.id, entryIds, timer?.metricId === initial.id ? timer : null, goalIds, reviewIds);
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
          // Stored values are seconds or plain numbers; switching between them
          // would misread history. Check off reads any amount as "done", so
          // switching to it is safe; switching back isn't.
          <div className="text-[15px]">
            {initial?.type === 'check' || type !== 'check' ? (
              <p>
                {type === 'duration' ? 'Time' : type === 'count' ? 'A number' : type === 'phrase' ? 'Phrases' : 'Check off'}
                <span className="block text-[13px] text-ink-3">Fixed once entries exist{type !== 'check' && type !== 'phrase' ? ', except for switching to check off' : ''}.</span>
              </p>
            ) : (
              <p>
                Check off
                <span className="block text-[13px] text-ink-3">Every day with anything logged counts as done, so your streak and history stay. This can’t be switched back.</span>
              </p>
            )}
            {initial && initial.type !== 'check' && initial.type !== 'phrase' && (
              <button
                type="button"
                onClick={() => changeType(type === 'check' ? initial.type : 'check')}
                className="press mt-2 inline-flex min-h-10 items-center rounded-lg bg-s2 px-3 text-[14px] font-medium hover:bg-s3"
              >
                {type === 'check' ? `Keep it as ${initial.type === 'duration' ? 'time' : 'a number'}` : 'Switch to check off'}
              </button>
            )}
          </div>
        ) : (
          <Segmented label="Measured as" value={type} onChange={changeType} options={[{ value: 'duration', label: 'Time' }, { value: 'count', label: 'A number' }, { value: 'check', label: 'Check off' }, { value: 'phrase', label: 'Phrases' }]} />
        )}
        {type === 'check' && entryIds.length === 0 && <p className="mt-1.5 text-[13px] text-ink-3">Done or not done: one tap on Today, no amounts.</p>}
        {type === 'phrase' && entryIds.length === 0 && (
          <p className="mt-1.5 text-[13px] text-ink-3">
            Collect a quote, saying or hadith a day. Each day you also review one from before, and a day only counts when both are done.
          </p>
        )}
      </div>

      {type === 'count' && (
        <div>
          <Label htmlFor="m-unit">Unit</Label>
          <input id="m-unit" className={inputClass} value={unit} maxLength={12} onChange={(e) => setUnit(e.target.value)} placeholder="kcal, pages, glasses" />
          <FieldError>{errors.unit}</FieldError>
        </div>
      )}

      {type === 'check' ? (
        errors.target && <FieldError>{errors.target}</FieldError>
      ) : (
        <div>
          <Label>{type === 'phrase' ? 'Phrases to add each day' : 'Daily target'}</Label>
          {type !== 'phrase' && <Segmented label="Target direction" value={direction} onChange={setDirection} options={[{ value: 'at_least', label: 'At least' }, { value: 'at_most', label: 'At most' }, { value: 'between', label: 'Range' }]} />}
          {direction === 'between' ? (
            <div className="mt-2 flex flex-col gap-2">
              <div>
                <p className="mb-1 text-[13px] text-ink-2">From</p>
                {type === 'duration' ? (
                  <DurationInput idPrefix="m-min" hours={minHours} minutes={minMinutes} onHours={setMinHours} onMinutes={setMinMinutes} />
                ) : (
                  <CountInput id="m-min" value={minCount} onChange={setMinCount} unit={unit || 'units'} />
                )}
              </div>
              <div>
                <p className="mb-1 text-[13px] text-ink-2">To</p>
                {type === 'duration' ? (
                  <DurationInput idPrefix="m-target" hours={tHours} minutes={tMinutes} onHours={setTHours} onMinutes={setTMinutes} />
                ) : (
                  <CountInput id="m-target" value={tCount} onChange={setTCount} unit={unit || 'units'} />
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2">
              {type === 'duration' ? (
                <DurationInput idPrefix="m-target" hours={tHours} minutes={tMinutes} onHours={setTHours} onMinutes={setTMinutes} />
              ) : (
                <CountInput id="m-target" value={tCount} onChange={setTCount} unit={type === 'phrase' ? 'phrases' : unit || 'units'} />
              )}
            </div>
          )}
          <FieldError>{errors.target}</FieldError>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {type === 'phrase' ? 'At least this many. The day counts once they’re added and the day’s review is done. ' : ''}
            {direction === 'at_most' ? 'A day counts only if you logged something and stayed at or under. ' : ''}
            {type === 'phrase' ? '' : direction === 'between' ? 'A day counts only if you logged something and ended up between the two, both included. ' : 'Leave blank for no target. '}
            {initial ? 'Changing a target only affects the days from the date you choose; earlier days keep the target they had.' : ''}
          </p>
          {targetEdited && (
            <div className="mt-3">
              <Label htmlFor="m-from">New target applies from</Label>
              <input id="m-from" type="date" className={inputClass} value={applyFrom} max={today} onChange={(e) => setApplyFrom(e.target.value)} />
              <FieldError>{errors.from}</FieldError>
              <p className="mt-1.5 text-[13px] text-ink-3">Pick an earlier day to fix the past. Targets you set after that day are replaced.</p>
            </div>
          )}
          {initial && (initial.targetHistory?.length ?? 0) > 0 && (
            <p className="mt-3 text-[13px] text-ink-2">Target history</p>
          )}
          {initial && (initial.targetHistory?.length ?? 0) > 0 && (
            <ul className="mt-1 divide-y divide-line border-y border-line text-[13px]" aria-label="Target history">
              {targetPeriods(initial).map((p, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span>{formatTarget({ ...initial, ...p }) ?? 'No target'}</span>
                  <span className="text-ink-3">
                    {p.from && p.to ? `${formatLocalDate(p.from, 'd MMM')} – ${formatLocalDate(p.to, 'd MMM')}` : p.to ? `until ${formatLocalDate(p.to, 'd MMM')}` : `from ${formatLocalDate(p.from!, 'd MMM')}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {type === 'phrase' && (
        <div>
          <Switch checked={carouselOn} onChange={setCarouselOn} label="Cycle your phrases on Today" />
          {carouselOn && (
            <div className="mt-2 flex flex-col gap-3">
              <Segmented
                label="Carousel style"
                value={carouselStyle}
                onChange={setCarouselStyle}
                options={[{ value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide' }, { value: 'stack', label: 'Stack' }, { value: 'ticker', label: 'Ticker' }]}
              />
              <Segmented
                label="Carousel pace"
                value={carouselPace}
                onChange={setCarouselPace}
                options={[{ value: 'fast', label: 'Fast' }, { value: 'normal', label: 'Normal' }, { value: 'slow', label: 'Slow' }]}
              />
            </div>
          )}
          <p className="mt-1.5 text-[13px] text-ink-3">
            Shows one phrase at a time in a shuffled order, every phrase once before any repeat. Longer phrases stay up longer. Hold or hover to pause; swipe or use the arrows to move on.
          </p>
        </div>
      )}

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

      {type !== 'check' && type !== 'phrase' && (
        <div>
          <Label htmlFor="m-quick">One-tap buttons ({type === 'duration' ? 'minutes' : unit || 'units'})</Label>
          <input id="m-quick" className={inputClass} inputMode="text" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="15, 30, 60" />
          <FieldError>{errors.quick}</FieldError>
        </div>
      )}

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

      <div>
        <Label>Achievement binder</Label>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Achievement binder">
          {THEMES.map((t) => {
            const BinderIcon = BINDER_ICON[t.id];
            return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={shownTheme === t.id}
              onClick={() => setAchTheme(t.id)}
              className={cx(
                'press flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium',
                shownTheme === t.id ? 'bg-s3 text-ink ring-1 ring-ink/30' : 'bg-s2 text-ink-2 hover:text-ink',
              )}
            >
              <BinderIcon size={15} className="shrink-0" aria-hidden />
              <span className="truncate">{t.label}</span>
            </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[13px] text-ink-3">
          The binder on your Profile this metric is linked to: time on a Study metric can earn Academic Menace.{achTheme ? '' : ' Linked for you from its icon until you pick one.'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary">{initial ? 'Save changes' : 'Create metric'}</Button>
        {/* Goals need an at_least metric; a cumulative ceiling means nothing. */}
        {initial && initial.targetDirection === 'at_least' && initial.type !== 'check' && onGoal && (
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
