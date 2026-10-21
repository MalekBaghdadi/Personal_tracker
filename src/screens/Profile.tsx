import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Link2, Pencil, Pin, PinOff, Settings as SettingsIcon, Shirt } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useCompete } from '../state/CompeteContext';
import { usePlans } from '../state/PlansContext';
import { useAchievements } from '../state/AchievementsContext';
import { SECRETS, TIERS, achievementById, type Ladder } from '../lib/achievementCatalog';
import { bestText, needOf } from '../lib/achievements';
import { binderViews, unlinkTarget, type BinderId, type BinderView } from '../lib/binders';
import { BINDER_ICON } from '../lib/binderIcons';
import { THEMES, themeById, themeFromIcon, themeOf } from '../lib/themes';
import { MAX_PINNED } from '../lib/profile';
import { saveSettings, setMetricTheme } from '../lib/repo';
import { formatLocalDate } from '../lib/dates';
import { local } from '../lib/device';
import { iconFor } from '../lib/icons';
import { AchievementCard, Avatar, CardBack, MiniCard, useTierInk, type CardState } from '../components/AchievementCard';
import { SharedProfileView, TierCounts } from '../components/ProfileView';
import { Reveal } from '../components/Reveal';
import { Button, FieldError, Label, Sheet, Switch, cx, inputClass, useToast } from '../components/ui';
import type { ThemeId } from '../lib/types';

/**
 * Your profile: level, rank and title from collected cards, the cards
 * waiting to be flipped, a showcase, and the binders (lib/binders.ts), a deck
 * you swipe through: every ladder from Bronze to Mythic, plus secrets.
 * Settings sit behind the gear.
 */
export function Profile({ collectNow }: { collectNow: boolean }) {
  const a = useAchievements();
  const [reveal, setReveal] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linkBinder, setLinkBinder] = useState<ThemeId | null>(null);

  // From the banner's Collect (#/profile/collect): straight into the reveal.
  useEffect(() => {
    if (!collectNow || !a.ready) return;
    if (a.waiting.length) setReveal(a.waiting.map((u) => u.id));
    window.location.replace('#/profile');
    // Once, when the link is followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectNow, a.ready]);

  const flipFrom = (id: string) => {
    const ids = a.waiting.map((u) => u.id);
    setReveal([id, ...ids.filter((x) => x !== id)]);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">Profile</h1>
        <a
          href="#/settings"
          aria-label="Settings"
          title="Settings"
          data-tour="profile-settings"
          className="press inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[14px] font-medium text-ink-2 hover:bg-s2 hover:text-ink"
        >
          <SettingsIcon size={20} aria-hidden />
          <span className="hidden sm:inline">Settings</span>
        </a>
      </header>

      <Identity />
      <ShareRow />
      {a.waiting.length > 0 && <ReadyShelf onFlip={flipFrom} onAll={() => setReveal(a.waiting.map((u) => u.id))} />}
      <Showcase onOpen={setDetail} />
      <Nudge onPick={() => setLinksOpen(true)} />
      <Binders onOpen={setDetail} onLink={(id) => themeById.has(id as ThemeId) && setLinkBinder(id as ThemeId)} />
      <div className="mt-3 flex justify-center">
        <Button variant="ghost" className="min-h-10 px-3" onClick={() => setLinksOpen(true)} data-tour="profile-themes">
          <Link2 size={16} aria-hidden /> Link metrics to binders
        </Button>
      </div>

      <CardSheet id={detail} onClose={() => setDetail(null)} onFlip={(id) => {
        setDetail(null);
        flipFrom(id);
      }} />
      <LinksSheet open={linksOpen} onClose={() => setLinksOpen(false)} />
      <LinkSheet id={linkBinder} onClose={() => setLinkBinder(null)} />
      {reveal && <Reveal ids={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

const stateOf = (id: string, collected: Map<string, unknown>, unlocked: Map<string, unknown>): CardState =>
  collected.has(id) ? 'collected' : unlocked.has(id) ? 'ready' : 'locked';

// ── Who you are ─────────────────────────────────────────────────────────────

function Identity() {
  const { summary, name, collected, total, waiting, evaluation } = useAchievements();
  const ink = useTierInk();
  const [editing, setEditing] = useState(false);
  const into = summary.xp - summary.levelFrom;
  const span = summary.levelTo - summary.levelFrom;
  const found = SECRETS.filter((s) => collected.has(s.id) || evaluation.unlocked.has(s.id)).length;
  const title = summary.title;

  return (
    <section aria-label="Your level and title" data-tour="profile-header" className="rounded-2xl border border-line bg-s1 p-4">
      <div className="flex items-center gap-4">
        <Avatar worn={title} rank={summary.rank.name} size={68} label={title ? `Wearing ${title.name}` : summary.rank.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h2 className="truncate text-[19px] font-semibold" data-testid="profile-name">{name}</h2>
            <button type="button" onClick={() => setEditing(true)} aria-label="Change your name" className="press grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-s2 hover:text-ink">
              <Pencil size={15} aria-hidden />
            </button>
          </div>
          <p className="truncate text-[15px] font-medium" style={title ? { color: ink(title.tier) } : undefined} data-testid="profile-title">
            {title ? title.name : summary.rank.name}
          </p>
          <p className="text-[13px] text-ink-3" data-testid="profile-level">
            Level {summary.level}{title ? ` · ${summary.rank.name}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-[12px] text-ink-3">
          <span className="tabular-nums" data-testid="profile-xp">{summary.xp} XP</span>
          <span className="tabular-nums">{summary.levelTo - summary.xp} XP to level {summary.level + 1}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-s2" role="progressbar" aria-label="XP to the next level" aria-valuemin={0} aria-valuemax={span} aria-valuenow={into}>
          <div className="bar-fill h-full rounded-full" style={{ width: `${span ? (into / span) * 100 : 0}%`, background: 'linear-gradient(90deg, #e0a03a, #f472b6)' }} />
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Collected" value={`${collected.size}`} sub={`of ${total}`} />
        <Stat label="Ready" value={`${waiting.length}`} sub={waiting.length ? 'to flip' : 'all flipped'} />
        <Stat label="Secrets" value={`${found}`} sub={`of ${SECRETS.length}`} />
      </dl>
      <TierCounts tiers={summary.tiers} className="mt-3 justify-center" />
      <NameSheet open={editing} onClose={() => setEditing(false)} />
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-s2 px-2 py-2">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="text-[20px] leading-tight font-semibold tabular-nums">{value}</dd>
      <dd className="text-[12px] text-ink-3">{sub}</dd>
    </div>
  );
}

function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid } = useData();
  const { name } = useAchievements();
  const toast = useToast();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setValue(name);
      setError(null);
    }
  }, [open, name]);
  return (
    <Sheet open={open} onClose={onClose} title="Your name">
      <form
        noValidate
        className="mt-2 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return setError('Give it a name.');
          saveSettings(uid, { displayName: v });
          toast('Name saved');
          onClose();
        }}
      >
        <div>
          <Label htmlFor="p-name">Name on your profile</Label>
          <input id="p-name" className={inputClass} value={value} maxLength={30} onChange={(e) => setValue(e.target.value)} autoFocus />
          <FieldError>{error}</FieldError>
        </div>
        <Button type="submit" variant="primary">Save</Button>
      </form>
    </Sheet>
  );
}

// ── Sharing with the Compete partner ────────────────────────────────────────

function ShareRow() {
  const { uid, settings } = useData();
  const { pair, partnerName } = useCompete();
  const { partnerProfile } = useAchievements();
  const [open, setOpen] = useState(false);
  const on = settings?.shareProfile === true;
  if (!pair) {
    return (
      <p className="mt-3 px-1 text-[13px] text-ink-3" data-tour="profile-share">
        Pair up with someone in Compete and you can show them your profile.
      </p>
    );
  }
  return (
    <section aria-label="Sharing" className="mt-3 rounded-xl border border-line px-4 pb-3" data-tour="profile-share">
      <Switch checked={on} onChange={(v) => saveSettings(uid, { shareProfile: v })} label={`Show my profile to ${partnerName}`} />
      <p className="text-[13px] text-ink-3">
        {on
          ? `${partnerName} sees your level, title, showcase and the cards you’ve collected. Nothing you log.`
          : `Off. ${partnerName} can’t see your profile.`}
      </p>
      {partnerProfile ? (
        <Button className="mt-3 w-full" onClick={() => setOpen(true)}>See {partnerName}’s profile</Button>
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">{partnerName} isn’t sharing theirs{on ? ' yet' : ''}.</p>
      )}
      <Sheet open={open && !!partnerProfile} onClose={() => setOpen(false)} title={`${partnerName}’s profile`}>
        {partnerProfile && <SharedProfileView profile={partnerProfile} />}
      </Sheet>
    </section>
  );
}

// ── Waiting to be flipped ───────────────────────────────────────────────────

function ReadyShelf({ onFlip, onAll }: { onFlip: (id: string) => void; onAll: () => void }) {
  const { waiting } = useAchievements();
  const shown = waiting.slice(0, 12);
  return (
    <section aria-label="Ready to collect" className="mt-5" data-tour="profile-ready">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Ready to collect <span className="text-ink-3">· {waiting.length}</span></h2>
        <Button variant="primary" className="min-h-10 px-3.5" onClick={onAll}>{waiting.length > 1 ? 'Collect all' : 'Collect'}</Button>
      </div>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-3" data-testid="ready-shelf">
        {shown.map((u) => {
          const def = achievementById.get(u.id)!;
          return (
            <li key={u.id} className="shrink-0">
              <button type="button" onClick={() => onFlip(u.id)} aria-label={`Flip ${def.name}, ${TIERS[def.tier].name}`} className="press block rounded-[14px]">
                <CardBack tier={def.tier} w={88} />
              </button>
            </li>
          );
        })}
        {waiting.length > shown.length && (
          <li className="flex shrink-0 items-center px-2 text-[13px] text-ink-3">+{waiting.length - shown.length} more</li>
        )}
      </ul>
    </section>
  );
}

// ── Showcase: up to three pinned cards ──────────────────────────────────────

function Showcase({ onOpen }: { onOpen: (id: string) => void }) {
  const { summary } = useAchievements();
  const slots = Array.from({ length: MAX_PINNED }, (_, i) => summary.pinned[i] ?? null);
  return (
    <section aria-label="Showcase" className="mt-6">
      <h2 className="mb-2 text-[15px] font-semibold">Showcase</h2>
      <ul className="grid grid-cols-3 gap-2" data-testid="showcase">
        {slots.map((def, i) => (
          <li key={def?.id ?? `empty-${i}`}>
            {def ? (
              <button type="button" onClick={() => onOpen(def.id)} className="press flex w-full flex-col items-center gap-1.5 rounded-xl p-1.5 hover:bg-s1">
                <MiniCard def={def} state="collected" w={72} />
                <span className="line-clamp-2 text-center text-[12px] leading-tight font-medium">{def.name}</span>
              </button>
            ) : (
              <div className="flex w-full flex-col items-center gap-1.5 p-1.5 text-ink-3">
                <div className="grid aspect-[5/7] w-[72px] place-items-center rounded-[9px] border border-dashed border-line">
                  <Pin size={16} aria-hidden />
                </div>
                <span className="text-[12px] leading-tight">Pin a card</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {summary.pinned.length === 0 && <p className="mt-2 text-[13px] text-ink-3">Open any card you’ve collected and pin it here.</p>}
    </section>
  );
}

// ── Metrics left in Other ───────────────────────────────────────────────────

function Nudge({ onPick }: { onPick: () => void }) {
  const { metrics } = useData();
  const loose = metrics.filter((m) => !m.archivedAt && !m.theme && themeFromIcon(m.icon) === 'other');
  if (!loose.length) return null;
  const list = loose.map((m) => m.name);
  const names = list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return (
    <section className="mt-6 rounded-xl border border-line bg-s1 p-4" data-testid="theme-nudge">
      <p className="text-[14px]">
        <span className="font-medium">{names}</span> {loose.length === 1 ? 'is' : 'are'} in the Other binder. Link {loose.length === 1 ? 'it' : 'them'} to one like Study or Fitness for cards made for {loose.length === 1 ? 'it' : 'them'}.
      </p>
      <Button className="mt-3" onClick={onPick}>Link metrics</Button>
    </section>
  );
}

// ── The binders: a deck you swipe through ──────────────────────────────────

const BINDER_KEY = 'pt.profile.binder';

/** What a general binder counts, under its name. */
const COUNTS: Partial<Record<BinderId, string>> = {
  streaks: 'Counts every metric with a target.',
  grind: 'Counts everything you log.',
  goals: 'Counts your deadline goals and plans.',
  compete: 'Counts your Compete wins.',
  habits: 'Counts every timer and note.',
  secrets: 'Hidden until you stumble into them. Tap one for a hint.',
};

/** Where a greyed general binder's button goes. */
const START: Partial<Record<BinderId, { href: string; label: string }>> = {
  streaks: { href: '#/metrics', label: 'Open Metrics' },
  grind: { href: '#/metrics', label: 'Open Metrics' },
  goals: { href: '#/metrics', label: 'Make a goal' },
  compete: { href: '#/compete', label: 'Go to Compete' },
  habits: { href: '#/today', label: 'Open Today' },
};

const nameList = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

function Binders({ onOpen, onLink }: { onOpen: (id: string) => void; onLink: (id: BinderId) => void }) {
  const { evaluation, collected } = useAchievements();
  const { metrics, goals } = useData();
  const { pair } = useCompete();
  const { plans } = usePlans();
  const views = useMemo(
    () => binderViews({
      metrics: metrics.filter((m) => !m.archivedAt),
      applicable: evaluation.ladders,
      held: (l) => l.steps.some((_, i) => collected.has(`${l.id}.${i + 1}`) || evaluation.unlocked.has(`${l.id}.${i + 1}`)),
      paired: !!pair,
      hasGoals: goals.length > 0 || plans.length > 0,
    }),
    [metrics, evaluation, collected, pair, goals, plans],
  );
  const deck = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [index, setIndex] = useState(() => Math.max(0, views.findIndex((v) => v.binder.id === local.get(BINDER_KEY))));
  const [deckW, setDeckW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const current = Math.min(index, views.length - 1);
  const currentId = views[current]?.binder.id;
  const shownId = useRef(currentId);

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(views.length - 1, i));
    shownId.current = views[next]?.binder.id;
    setIndex(next);
  };

  // Binders light up and grey out, which reorders them: stay on the same binder.
  useEffect(() => {
    const i = views.findIndex((v) => v.binder.id === shownId.current);
    if (i >= 0 && i !== index) setIndex(i);
    // Only when the order changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views]);

  useLayoutEffect(() => {
    const d = deck.current;
    if (!d) return;
    const fit = () => setDeckW(d.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(d);
    return () => ro.disconnect();
  }, []);

  // Keep the chosen binder's chip in view, and remember the binder by its id (the order changes as binders light up).
  useEffect(() => {
    tabs.current[current]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (currentId) local.set(BINDER_KEY, currentId);
  }, [current, currentId]);

  // One binder per page: the one in front is 88% wide and centred, its neighbours peek in at the sides.
  const GAP = 12;
  const pageW = Math.round(deckW * 0.88);
  const miniW = Math.max(34, Math.min(52, Math.floor((pageW - 32 - 5 * 6) / 6)));
  const offset = (deckW - pageW) / 2 - current * (pageW + GAP) + (drag ?? 0);

  // A swipe moves exactly one binder: the browser keeps vertical scrolling (touch-action: pan-y), we take sideways drags.
  const gesture = useRef<{ id: number; x: number; y: number; t: number; side: boolean } | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, side: false };
    swiped.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.side) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        g.side = true;
        swiped.current = true;
        deck.current?.setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 10) {
        gesture.current = null;
        return;
      } else return;
    }
    // Past the first or last binder it only gives a little.
    const end = (current === 0 && dx > 0) || (current === views.length - 1 && dx < 0);
    setDrag(end ? dx / 4 : dx);
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.side) return;
    const dx = e.clientX - g.x;
    const speed = dx / Math.max(1, e.timeStamp - g.t);
    setDrag(null);
    if (e.type === 'pointercancel') return;
    if (dx < -pageW * 0.18 || speed < -0.35) goTo(current + 1);
    else if (dx > pageW * 0.18 || speed > 0.35) goTo(current - 1);
  };

  return (
    <section aria-label="Binders" className="mt-7" data-tour="profile-binder">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Binders</h2>
        <span className="text-[13px] text-ink-3 tabular-nums" data-testid="binder-position">{current + 1} of {views.length}</span>
      </div>
      <div role="tablist" aria-label="Binders" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3" data-tour="profile-binder-tabs">
        {views.map((v, i) => {
          const Icon = BINDER_ICON[v.binder.id];
          return (
            <button
              key={v.binder.id}
              ref={(el) => { tabs.current[i] = el; }}
              type="button"
              role="tab"
              aria-selected={i === current}
              onClick={() => goTo(i)}
              data-testid={`binder-tab-${v.binder.id}`}
              className={cx(
                'press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium',
                i === current ? 'bg-ink text-bg' : 'bg-s2 text-ink-2 hover:text-ink',
                !v.active && i !== current && 'opacity-50',
              )}
            >
              {Icon && <Icon size={14} aria-hidden />}
              {v.binder.title}
            </button>
          );
        })}
      </div>
      <div
        ref={deck}
        className="binder-deck -mx-4 overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // Focus moving into a binder must not scroll the deck sideways; only the pager moves it.
        onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
        // A swipe that ends over a card doesn't open it.
        onClickCapture={(e) => {
          if (!swiped.current) return;
          swiped.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div className={cx('binder-track flex h-full', drag !== null && 'dragging')} style={{ gap: GAP, transform: `translate3d(${offset}px, 0, 0)` }}>
          {views.map((v, i) => (
            <div
              key={v.binder.id}
              className="binder-page h-full shrink-0 overflow-y-auto overscroll-contain"
              style={{ width: pageW || '88%' }}
              data-front={i === current}
              // A tap on a binder peeking in at the side brings it to the front, without opening what was under the finger.
              onClickCapture={i === current ? undefined : (e) => {
                e.stopPropagation();
                e.preventDefault();
                goTo(i);
              }}
            >
              <BinderPage view={v} front={i === current} miniW={miniW} onOpen={onOpen} onLink={() => onLink(v.binder.id)} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button variant="ghost" className="min-h-10 px-2.5" disabled={current === 0} onClick={() => goTo(current - 1)} aria-label="Previous binder">
          <ChevronLeft size={18} aria-hidden /> <span className="max-w-[9rem] truncate">{views[current - 1]?.binder.title ?? ''}</span>
        </Button>
        <Button variant="ghost" className="min-h-10 px-2.5" disabled={current === views.length - 1} onClick={() => goTo(current + 1)} aria-label="Next binder">
          <span className="max-w-[9rem] truncate">{views[current + 1]?.binder.title ?? ''}</span> <ChevronRight size={18} aria-hidden />
        </Button>
      </div>
    </section>
  );
}

function BinderPage({ view, front, miniW, onOpen, onLink }: { view: BinderView; front: boolean; miniW: number; onOpen: (id: string) => void; onLink: () => void }) {
  const { collected, evaluation } = useAchievements();
  const { binder, active, linked, ladders, why } = view;
  const Icon = BINDER_ICON[binder.id];
  const secrets = binder.id === 'secrets';
  const ids = secrets ? SECRETS.map((s) => s.id) : ladders.flatMap((l) => l.steps.map((_, i) => `${l.id}.${i + 1}`));
  const have = ids.filter((id) => collected.has(id) || (secrets && evaluation.unlocked.has(id))).length;
  const start = START[binder.id];
  return (
    <div className={cx('rounded-2xl border border-line bg-s1 px-4 pb-1', !active && 'binder-off')} data-testid={`group-${binder.id}`} data-active={active}>
      <div className="flex items-baseline justify-between gap-3 pt-3">
        <h3 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold">
          {Icon && <Icon size={18} className="shrink-0 self-center text-ink-2" aria-hidden />}
          <span className="truncate">{binder.title}</span>
        </h3>
        <span className="shrink-0 text-[13px] text-ink-3 tabular-nums">{secrets ? `${have} of ${ids.length} found` : `${have} / ${ids.length}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line pt-1.5 pb-3 text-[13px]">
        <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] uppercase', binder.kind === 'targeted' ? 'bg-s3 text-ink' : 'bg-s2 text-ink-3')} data-testid="binder-kind">
          {binder.kind === 'targeted' ? 'Targeted' : 'General'}
        </span>
        {binder.kind === 'targeted' ? (
          <>
            <span className="min-w-0 text-ink-2" data-testid="binder-linked">
              {linked.length ? <>Linked: <span className="font-medium text-ink">{nameList(linked.map((m) => m.name))}</span></> : 'No metric linked'}
            </span>
            <button
              type="button"
              onClick={onLink}
              data-tour={front ? 'profile-links' : undefined}
              className="press ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-medium text-ink-2 hover:bg-s2 hover:text-ink"
            >
              <Link2 size={15} aria-hidden /> {linked.length ? 'Change' : 'Link'}
            </button>
          </>
        ) : (
          <span className="text-ink-3">{COUNTS[binder.id]}</span>
        )}
      </div>
      {!active && (
        <div className="mt-3 rounded-xl bg-s2 p-3" data-testid="binder-why">
          <p className="text-[14px] text-ink-2">{why}</p>
          {binder.kind === 'targeted' ? (
            <Button className="mt-2.5 bg-s3 hover:bg-raise" onClick={onLink}><Link2 size={16} aria-hidden /> Link a metric</Button>
          ) : start ? (
            <a href={start.href} className="press mt-2.5 inline-flex min-h-11 items-center rounded-lg bg-s3 px-4 text-[15px] font-medium hover:bg-raise">{start.label}</a>
          ) : null}
        </div>
      )}
      <div className={cx(!active && 'binder-off-cards')}>
        {secrets ? <SecretRow miniW={miniW} onOpen={onOpen} /> : <div className="divide-y divide-line">{ladders.map((l) => <LadderRow key={l.id} ladder={l} miniW={miniW} onOpen={onOpen} />)}</div>}
      </div>
    </div>
  );
}

function LadderRow({ ladder, miniW, onOpen }: { ladder: Ladder; miniW: number; onOpen: (id: string) => void }) {
  const { evaluation, collected } = useAchievements();
  const ink = useTierInk();
  const best = evaluation.best.get(ladder.id) ?? 0;
  const ids = ladder.steps.map((_, i) => `${ladder.id}.${i + 1}`);
  const nextIdx = ids.findIndex((id) => !evaluation.unlocked.has(id) && !collected.has(id));
  const next = nextIdx >= 0 ? ladder.steps[nextIdx] : null;
  const pct = next ? Math.min(1, best / next.at) : 1;
  return (
    <div className="py-3" data-testid="ladder" data-ladder={ladder.id}>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[15px] font-medium">{ladder.title}</h4>
        <span className="shrink-0 text-[12px] text-ink-3">{best > 0 ? `Best: ${bestText(ladder, best)}` : 'Not started'}</span>
      </div>
      <ul className="mt-2 grid grid-cols-6 justify-items-center gap-1.5">
        {ladder.steps.map((s, i) => {
          const state = stateOf(ids[i], collected, evaluation.unlocked);
          return (
            <li key={ids[i]}>
              <button
                type="button"
                onClick={() => onOpen(ids[i])}
                aria-label={`${s.name}, ${TIERS[i].name}, ${state === 'collected' ? 'collected' : state === 'ready' ? 'ready to collect' : 'locked'}`}
                className="press block rounded-[10px]"
              >
                <MiniCard def={achievementById.get(ids[i])!} state={state} w={miniW} />
              </button>
            </li>
          );
        })}
      </ul>
      {next ? (
        <div className="mt-2">
          <div className="flex justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate text-ink-2">Next: <span className="font-medium text-ink">{next.name}</span></span>
            <span className="shrink-0 text-ink-3 tabular-nums">{bestText(ladder, Math.min(best, next.at))} / {bestText(ladder, next.at)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-s2">
            <div className="bar-fill h-full rounded-full" style={{ width: `${pct * 100}%`, background: ink(nextIdx) }} />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-ink-3">Every card in this row is yours.</p>
      )}
    </div>
  );
}

function SecretRow({ miniW, onOpen }: { miniW: number; onOpen: (id: string) => void }) {
  const { evaluation, collected } = useAchievements();
  return (
    <ul className="grid grid-cols-6 justify-items-center gap-1.5 pt-3 pb-3">
      {SECRETS.map((s) => {
        const state = stateOf(s.id, collected, evaluation.unlocked);
        const def = achievementById.get(s.id)!;
        return (
          <li key={s.id}>
            <button type="button" onClick={() => onOpen(s.id)} aria-label={state === 'locked' ? 'Secret, locked' : `${s.name}, ${state === 'ready' ? 'ready to collect' : 'collected'}`} className="press block rounded-[10px]">
              <MiniCard def={def} state={state} secretHidden w={miniW} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── One card, up close ──────────────────────────────────────────────────────

function CardSheet({ id, onClose, onFlip }: { id: string | null; onClose: () => void; onFlip: (id: string) => void }) {
  const { uid, settings, today } = useData();
  const { collected, evaluation, summary } = useAchievements();
  const ink = useTierInk();
  const toast = useToast();
  const def = id ? achievementById.get(id) : undefined;
  const state = id ? stateOf(id, collected, evaluation.unlocked) : 'locked';
  const hidden = !!def?.secret && state === 'locked';
  const w = Math.min(250, typeof window === 'undefined' ? 250 : window.innerWidth - 120);

  const pinned = (settings?.pinned ?? []).filter((p) => collected.has(p));
  const isPinned = !!id && pinned.includes(id);
  const wearing = !!id && summary.title?.id === id;

  let body: React.ReactNode = null;
  if (def && id) {
    if (state === 'collected') {
      const c = collected.get(id)!;
      body = (
        <>
          <div className="flex justify-center pt-1"><AchievementCard def={def} w={w} on={c.on} /></div>
          {c.detail && <p className="mt-3 text-center text-[14px] text-ink-2" data-testid="card-detail">{c.detail}</p>}
          <p className="mt-1 text-center text-[12px] text-ink-3">
            Earned {formatLocalDate(c.on, c.on.slice(0, 4) === today.slice(0, 4) ? 'd MMM' : 'd MMM yyyy')} · {TIERS[def.tier].xp} XP
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                if (isPinned) {
                  saveSettings(uid, { pinned: pinned.filter((p) => p !== id) });
                  toast(`Unpinned ${def.name}`);
                } else if (pinned.length >= MAX_PINNED) {
                  toast('Your showcase holds three. Unpin one first.');
                } else {
                  saveSettings(uid, { pinned: [...pinned, id] });
                  toast(`Pinned ${def.name}`);
                }
              }}
            >
              {isPinned ? <><PinOff size={17} aria-hidden /> Unpin</> : <><Pin size={17} aria-hidden /> Pin</>}
            </Button>
            <Button
              onClick={() => {
                saveSettings(uid, { title: wearing ? null : id });
                toast(wearing ? 'Title taken off' : `Now wearing ${def.name}`);
              }}
            >
              <Shirt size={17} aria-hidden /> {wearing ? 'Take off' : 'Wear as title'}
            </Button>
          </div>
        </>
      );
    } else if (state === 'ready') {
      body = (
        <>
          <div className="flex justify-center pt-1"><CardBack tier={def.tier} w={Math.min(200, w)} label="Ready" /></div>
          <p className="mt-4 text-center text-[16px] font-semibold">{def.name}</p>
          <p className="text-center text-[13px] font-medium" style={{ color: ink(def.tier) }}>{TIERS[def.tier].name} · {TIERS[def.tier].xp} XP</p>
          <p className="mt-1 text-center text-[14px] text-ink-2">{needOf(def)}</p>
          <Button variant="primary" className="mt-4 w-full" onClick={() => onFlip(id)}>Flip it</Button>
        </>
      );
    } else {
      const l = def.ladder;
      const best = l ? evaluation.best.get(l.id) ?? 0 : 0;
      const at = l ? l.steps[def.step!].at : 0;
      body = (
        <>
          <div className="flex justify-center pt-1"><AchievementCard def={def} w={w} locked /></div>
          <p className="mt-3 text-center text-[13px] font-medium" style={{ color: ink(def.tier) }}>{TIERS[def.tier].name} · {TIERS[def.tier].xp} XP</p>
          {l && evaluation.ladders.includes(l) && (
            <div className="mt-3">
              <div className="flex justify-between text-[13px] text-ink-2">
                <span>Best so far</span>
                <span className="tabular-nums">{bestText(l, Math.min(best, at))} / {bestText(l, at)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-s2">
                <div className="bar-fill h-full rounded-full" style={{ width: `${Math.min(1, best / at) * 100}%`, background: ink(def.tier) }} />
              </div>
            </div>
          )}
        </>
      );
    }
  }

  return (
    <Sheet open={!!def} onClose={onClose} title={def ? (hidden ? 'Secret' : def.name) : ''}>
      <div data-testid="card-sheet">{body}</div>
    </Sheet>
  );
}

// ── Linking metrics to binders ──────────────────────────────────────────────

/** One binder: tick the metrics it counts. A metric sits in one binder, so ticking moves it here. */
function LinkSheet({ id, onClose }: { id: ThemeId | null; onClose: () => void }) {
  const { uid, metrics } = useData();
  const active = metrics.filter((m) => !m.archivedAt);
  const binder = id ? themeById.get(id) : undefined;
  return (
    <Sheet open={!!binder} onClose={onClose} title={binder ? `Link to ${binder.label}` : ''}>
      {binder && id && (
        <>
          <p className="text-[14px] text-ink-2">
            Tick the metrics this binder counts. Each metric sits in one binder, so ticking one here moves it from where it is now. Its whole history counts straight away, and cards you’ve collected stay yours.
          </p>
          {active.length === 0 ? (
            <p className="mt-4 text-[14px] text-ink-3">Add a metric first.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-1" data-testid="link-list">
              {active.map((m) => {
                const Icon = iconFor(m.icon);
                const now = themeOf(m);
                const on = now === id;
                const back = unlinkTarget(m, id);
                const stuck = on && (back ?? themeFromIcon(m.icon)) === id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={stuck}
                      onClick={() => setMetricTheme(uid, m.id, on ? back : id)}
                      className="press flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-s2 disabled:hover:bg-transparent"
                    >
                      <span className={cx('grid size-6 shrink-0 place-items-center rounded-md border', on ? 'border-ink bg-ink text-bg' : 'border-line')}>
                        {on && <Check size={16} aria-hidden />}
                      </span>
                      <Icon size={18} className="shrink-0 text-ink-2" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{m.name}</span>
                        <span className="block text-[12px] text-ink-3">
                          {stuck ? 'Other is where unlinked metrics go' : on ? 'Linked here' : `Now in ${themeById.get(now)!.label}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button className="mt-4 w-full" onClick={onClose}>Done</Button>
        </>
      )}
    </Sheet>
  );
}

/** Every metric and the binder it's linked to, in one list. */
function LinksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid, metrics } = useData();
  const active = metrics.filter((m) => !m.archivedAt);
  return (
    <Sheet open={open} onClose={onClose} title="Link metrics">
      <p className="text-[14px] text-ink-2">
        Each metric is linked to one targeted binder, which decides the themed cards it counts toward: time on a Study metric can earn Academic Menace, days on a Fitness one Gym Rat. General binders, like Streaks, count everything.
      </p>
      {active.length === 0 ? (
        <p className="mt-4 text-[14px] text-ink-3">Add a metric first.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3" data-testid="themes-list">
          {active.map((m) => {
            const Icon = iconFor(m.icon);
            return (
              <li key={m.id} className="flex items-center gap-3">
                <Icon size={18} className="shrink-0 text-ink-2" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[15px]">{m.name}</span>
                <select
                  aria-label={`Binder for ${m.name}`}
                  className={`${inputClass} w-auto max-w-[11rem] shrink-0`}
                  value={themeOf(m)}
                  onChange={(e) => setMetricTheme(uid, m.id, e.target.value as ThemeId)}
                >
                  {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[13px] text-ink-3">Linked for you from each metric’s icon until you change it. Moving a metric moves its history to the new binder’s cards; cards you’ve collected stay yours.</p>
      <Button className="mt-4 w-full" onClick={onClose}>Done</Button>
    </Sheet>
  );
}
