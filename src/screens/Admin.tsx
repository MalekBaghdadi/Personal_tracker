import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, WifiOff } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useData } from '../state/DataContext';
import { useHue } from '../state/theme';
import { buildDayStats, fetchProfiles, fetchUserData, isAdmin, type UserData } from '../lib/admin';
import { DEFAULT_DAY_START_HOUR, addDays, deviceTimezone, formatLocalDate, todayIn, weekdayOf } from '../lib/dates';
import { computeStreaks, isHit, isScheduled } from '../lib/streaks';
import { computeGoal } from '../lib/goals';
import { formatValue } from '../lib/format';
import { iconFor } from '../lib/icons';
import { WEEKDAYS, cx } from '../components/ui';
import { GoalBar, fmtGoal, statusLabel } from '../components/Goals';
import type { DayStats, Goal, Metric } from '../lib/types';

/**
 * See-only admin view: every user's metrics, recent totals, streaks and goals.
 * Nothing here writes; the security rules would refuse it anyway.
 */
export function Admin({ id }: { id: string | null }) {
  const { uid } = useData();
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <a
        href={id ? '#/admin' : '#/settings'}
        className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[14px] text-ink-2 hover:bg-s1 hover:text-ink"
      >
        <ChevronLeft size={18} aria-hidden /> {id ? 'Users' : 'Settings'}
      </a>
      {!isAdmin(uid) ? (
        <p className="text-[15px] text-ink-2">This page isn’t available.</p>
      ) : id ? (
        <UserView key={id} id={id} />
      ) : (
        <UserList />
      )}
    </div>
  );
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: T; fromCache: boolean };

function useLoad<T>(fn: () => Promise<{ data: T; fromCache: boolean }>): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    fn()
      .then((r) => live && setLoad({ state: 'ok', ...r }))
      .catch((err) => {
        console.warn('[admin] load failed', err);
        if (live) setLoad({ state: 'error' });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return load;
}

function CacheNote() {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg bg-s1 px-3 py-2 text-[13px] text-ink-2">
      <WifiOff size={15} aria-hidden className="shrink-0" /> Offline: showing what this device has cached, which may be incomplete.
    </p>
  );
}

const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
const shortDate = (iso: string) => formatLocalDate(iso.slice(0, 10), 'd MMM yyyy');

// ── List ───────────────────────────────────────────────────────────────────

function UserList() {
  const { uid } = useData();
  const load = useLoad(fetchProfiles);
  const users = useMemo(
    () => (load.state === 'ok' ? [...load.data].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)) : []),
    [load],
  );

  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight">Users</h1>
      <p className="mt-1 mb-5 text-[14px] text-ink-3">
        Everyone who has opened the app since this page was added. You can see their data but not change it.
      </p>
      {load.state === 'loading' && <p className="text-[15px] text-ink-2">Loading…</p>}
      {load.state === 'error' && <p role="alert" className="text-[15px] text-danger">Couldn’t load users. Check your connection and try again.</p>}
      {load.state === 'ok' && (
        <>
          {load.fromCache && <CacheNote />}
          <p className="mb-2 text-[13px] text-ink-3">{users.length === 1 ? '1 user' : `${users.length} users`}</p>
          <ul className="divide-y divide-line border-y border-line" data-testid="admin-users">
            {users.map((p) => (
              <li key={p.uid}>
                <a href={`#/admin/${p.uid}`} className="flex min-h-14 items-center gap-3 py-3 hover:bg-s1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {p.email || 'No email'}
                      {p.uid === uid && <span className="ml-2 text-[13px] font-normal text-ink-3">you</span>}
                    </span>
                    <span className="block truncate text-[13px] text-ink-3">
                      Joined {shortDate(p.joinedAt)} · last seen {ago(p.lastSeenAt)}
                    </span>
                  </span>
                  <ChevronRight size={18} aria-hidden className="shrink-0 text-ink-3" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// ── One user ───────────────────────────────────────────────────────────────

function UserView({ id }: { id: string }) {
  const load = useLoad(() => fetchUserData(id));
  if (load.state === 'loading') return <p className="text-[15px] text-ink-2">Loading…</p>;
  if (load.state === 'error') return <p role="alert" className="text-[15px] text-danger">Couldn’t load this user. Check your connection and try again.</p>;
  return (
    <>
      {load.fromCache && <CacheNote />}
      <UserDetail data={load.data} />
    </>
  );
}

function UserDetail({ data }: { data: UserData }) {
  const { profile, settings, metrics, entries, goals } = data;
  const tz = settings?.timezone ?? deviceTimezone();
  const today = todayIn(tz, settings?.dayStartHour ?? DEFAULT_DAY_START_HOUR);
  const stats = useMemo(() => buildDayStats(entries), [entries]);
  const active = metrics.filter((m) => !m.archivedAt);
  const archived = metrics.length - active.length;
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const activeGoals = goals.filter((g) => !g.archivedAt && metricById.has(g.metricId)).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const lastEntry = entries.reduce<string | null>((max, e) => (max === null || e.occurredAt > max ? e.occurredAt : max), null);

  return (
    <>
      <header>
        <h1 className="truncate text-[22px] font-semibold tracking-tight">{profile?.email || 'Unknown user'}</h1>
        <p className="mt-0.5 text-[14px] text-ink-3">
          {profile ? <>Joined {shortDate(profile.joinedAt)} · last seen {ago(profile.lastSeenAt)}</> : 'No profile yet'}
        </p>
        <p className="mt-0.5 text-[14px] text-ink-3">
          {settings ? tz.replace(/_/g, ' ') : 'No settings yet'}
          {settings?.onboardedAt === null && ' · still on first run'}
          {lastEntry ? ` · last logged ${ago(lastEntry)}` : ' · nothing logged yet'}
        </p>
      </header>

      <h2 className="mt-6 mb-2 text-[15px] font-medium">Metrics</h2>
      {active.length === 0 ? (
        <p className="text-[14px] text-ink-3">No metrics.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="admin-metrics">
          {active.map((m) => (
            <MetricCard key={m.id} metric={m} stats={stats.get(m.id) ?? new Map()} today={today} />
          ))}
        </ul>
      )}
      {archived > 0 && <p className="mt-2 text-[13px] text-ink-3">{archived === 1 ? '1 archived metric' : `${archived} archived metrics`} not shown.</p>}

      <h2 className="mt-6 mb-2 text-[15px] font-medium">Deadline goals</h2>
      {activeGoals.length === 0 ? (
        <p className="text-[14px] text-ink-3">No active goals.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {activeGoals.map((g) => (
            <GoalRow key={g.id} goal={g} metric={metricById.get(g.metricId)!} entries={entries} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}

function targetText(m: Metric): string {
  const when = m.schedule.kind === 'days_of_week' ? m.schedule.days.map((d) => WEEKDAYS[d]).join(', ') : 'daily';
  if (m.target == null) return `No target · ${when}`;
  return `${m.targetDirection === 'at_most' ? 'At most' : 'At least'} ${formatValue(m, m.target)} · ${when}`;
}

function MetricCard({ metric, stats, today }: { metric: Metric; stats: DayStats; today: string }) {
  const hue = useHue(metric.color);
  const Icon = iconFor(metric.icon);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const week = days.reduce((sum, d) => sum + (stats.get(d)?.total ?? 0), 0);
  const todayTotal = stats.get(today)?.total ?? 0;
  const streaks = computeStreaks(metric, stats, today);

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <Icon size={17} style={{ color: hue }} aria-hidden className="shrink-0" />
        <span className="truncate text-[15px] font-medium">{metric.name}</span>
      </div>
      <p className="mt-0.5 text-[13px] text-ink-3">{targetText(metric)}</p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
        <div>
          <dt className="text-ink-3">Today</dt>
          <dd className="text-[15px] font-medium">{formatValue(metric, todayTotal)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Last 7 days</dt>
          <dd className="text-[15px] font-medium">{formatValue(metric, week)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Streak</dt>
          <dd className="text-[15px] font-medium">{streaks ? `${streaks.current} (best ${streaks.longest})` : '—'}</dd>
        </div>
      </dl>

      {/* Last 7 days: filled = target met (or logged, with no target), tint = logged, ring = due and missed. */}
      <ol className="mt-3 grid grid-cols-7 gap-1" aria-label="Last 7 days">
        {days.map((d) => {
          const s = stats.get(d);
          const due = isScheduled(metric.schedule, d);
          const hit = s ? isHit(metric, s.total, s.count) : null;
          const full = s && (hit === true || hit === null);
          return (
            <li key={d} className="text-center">
              <span
                className={cx('block h-5 rounded', !s && (due ? 'border border-line' : 'bg-transparent'))}
                style={s ? { background: hue, opacity: full ? 1 : 0.35 } : undefined}
                title={`${formatLocalDate(d, 'EEE d MMM')}: ${s ? formatValue(metric, s.total) : due ? 'nothing' : 'not scheduled'}`}
              />
              <span className="mt-0.5 block text-[11px] text-ink-3">{WEEKDAYS[weekdayOf(d)].slice(0, 2)}</span>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

function GoalRow({ goal, metric, entries, today }: { goal: Goal; metric: Metric; entries: UserData['entries']; today: string }) {
  const hue = useHue(metric.color);
  const r = useMemo(() => computeGoal(goal, entries, today), [goal, entries, today]);
  return (
    <li className="rounded-xl border border-line p-3">
      <p className="text-[15px] font-medium">{goal.name}</p>
      <p className="mt-0.5 text-[13px] text-ink-3">
        {fmtGoal(metric, r.done)} of {fmtGoal(metric, goal.targetTotal)} · due {formatLocalDate(goal.deadline, 'd MMM yyyy')}
      </p>
      <div className="mt-2">
        <GoalBar goal={goal} r={r} color={hue} />
      </div>
      <p className="mt-1.5 text-[13px] text-ink-2">{statusLabel(goal, metric, r, today)}</p>
    </li>
  );
}
