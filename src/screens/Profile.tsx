import { useEffect, useState } from 'react';
import { Pencil, Pin, PinOff, Settings as SettingsIcon, Shirt } from 'lucide-react';
import { useData } from '../state/DataContext';
import { useCompete } from '../state/CompeteContext';
import { useAchievements } from '../state/AchievementsContext';
import { GROUPS, LADDERS, SECRETS, TIERS, achievementById, type Ladder } from '../lib/achievementCatalog';
import { bestText, needOf } from '../lib/achievements';
import { THEMES, themeFromIcon, themeOf } from '../lib/themes';
import { MAX_PINNED } from '../lib/profile';
import { saveSettings, setMetricTheme } from '../lib/repo';
import { formatLocalDate } from '../lib/dates';
import { iconFor } from '../lib/icons';
import { AchievementCard, Avatar, CardBack, MiniCard, useTierInk, type CardState } from '../components/AchievementCard';
import { SharedProfileView, TierCounts } from '../components/ProfileView';
import { Reveal } from '../components/Reveal';
import { Button, FieldError, Label, Sheet, Switch, inputClass, useToast } from '../components/ui';
import type { ThemeId } from '../lib/types';

/**
 * Your profile: level, rank and title from collected cards, the cards
 * waiting to be flipped, a showcase, and the binder: every ladder from
 * Bronze to Mythic, plus secrets. Settings sit behind the gear.
 */
export function Profile({ collectNow }: { collectNow: boolean }) {
  const a = useAchievements();
  const [reveal, setReveal] = useState<string[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [themesOpen, setThemesOpen] = useState(false);

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
      <Nudge onPick={() => setThemesOpen(true)} />
      <Binder onOpen={setDetail} onThemes={() => setThemesOpen(true)} />

      <CardSheet id={detail} onClose={() => setDetail(null)} onFlip={(id) => {
        setDetail(null);
        flipFrom(id);
      }} />
      <ThemesSheet open={themesOpen} onClose={() => setThemesOpen(false)} />
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
        <Avatar art={title?.art[0] ?? summary.rank.art} tier={title?.tier ?? null} size={68} label={title ? `Wearing ${title.name}` : summary.rank.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h2 className="truncate text-[19px] font-semibold" data-testid="profile-name">{name}</h2>
            <button type="button" onClick={() => setEditing(true)} aria-label="Change your name" className="press grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-s2 hover:text-ink">
              <Pencil size={15} aria-hidden />
            </button>
          </div>
          <p className="truncate text-[15px] font-medium" style={title ? { color: ink(title.tier) } : undefined} data-testid="profile-title">
            {title ? title.name : `${summary.rank.art} ${summary.rank.name}`}
          </p>
          <p className="text-[13px] text-ink-3" data-testid="profile-level">
            Level {summary.level}{title ? ` · ${summary.rank.art} ${summary.rank.name}` : ''}
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

// ── Metrics without a theme of their own ────────────────────────────────────

function Nudge({ onPick }: { onPick: () => void }) {
  const { metrics } = useData();
  const loose = metrics.filter((m) => !m.archivedAt && !m.theme && themeFromIcon(m.icon) === 'other');
  if (!loose.length) return null;
  const list = loose.map((m) => m.name);
  const names = list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  return (
    <section className="mt-6 rounded-xl border border-line bg-s1 p-4" data-testid="theme-nudge">
      <p className="text-[14px]">
        <span className="font-medium">{names}</span> {loose.length === 1 ? 'is' : 'are'} under Other. Give {loose.length === 1 ? 'it' : 'them'} a theme, like Study or Fitness, for cards made for {loose.length === 1 ? 'it' : 'them'}.
      </p>
      <Button className="mt-3" onClick={onPick}>Pick themes</Button>
    </section>
  );
}

// ── The binder ──────────────────────────────────────────────────────────────

function Binder({ onOpen, onThemes }: { onOpen: (id: string) => void; onThemes: () => void }) {
  const { evaluation, collected } = useAchievements();
  const hasCollected = (l: Ladder) => l.steps.some((_, i) => collected.has(`${l.id}.${i + 1}`));
  // What applies now, plus any ladder you still hold cards from (a metric that changed theme, say).
  const shown = LADDERS.filter((l) => evaluation.ladders.includes(l) || hasCollected(l));
  const count = (ls: Ladder[]) => {
    let have = 0;
    let all = 0;
    for (const l of ls) l.steps.forEach((_, i) => {
      all++;
      if (collected.has(`${l.id}.${i + 1}`)) have++;
    });
    return `${have} / ${all}`;
  };
  return (
    <section aria-label="Binder" className="mt-7" data-tour="profile-binder">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Binder</h2>
        <Button variant="ghost" className="min-h-10 px-3" onClick={onThemes} data-tour="profile-themes">Themes</Button>
      </div>
      {THEMES.map((t) => {
        const ls = shown.filter((l) => l.theme === t.id);
        if (!ls.length) return null;
        return (
          <Group key={t.id} title={`${t.emoji} ${t.label}`} count={count(ls)} testId={`group-${t.id}`}>
            {ls.map((l) => <LadderRow key={l.id} ladder={l} onOpen={onOpen} />)}
          </Group>
        );
      })}
      {GROUPS.map((g) => {
        const ls = shown.filter((l) => !l.theme && l.group === g.id);
        if (!ls.length) return null;
        return (
          <Group key={g.id} title={`${g.emoji} ${g.title}`} count={count(ls)} testId={`group-${g.id}`}>
            {ls.map((l) => <LadderRow key={l.id} ladder={l} onOpen={onOpen} />)}
          </Group>
        );
      })}
      <Secrets onOpen={onOpen} />
    </section>
  );
}

function Group({ title, count, testId, children }: { title: string; count: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-s1 px-4 py-1" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line py-3">
        <h3 className="text-[16px] font-semibold">{title}</h3>
        <span className="text-[13px] text-ink-3 tabular-nums">{count}</span>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

function LadderRow({ ladder, onOpen }: { ladder: Ladder; onOpen: (id: string) => void }) {
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
                <MiniCard def={achievementById.get(ids[i])!} state={state} />
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

function Secrets({ onOpen }: { onOpen: (id: string) => void }) {
  const { evaluation, collected } = useAchievements();
  const found = SECRETS.filter((s) => collected.has(s.id) || evaluation.unlocked.has(s.id)).length;
  return (
    <div className="mt-4 rounded-2xl border border-line bg-s1 px-4 pb-4" data-testid="group-secrets">
      <div className="flex items-baseline justify-between gap-3 border-b border-line py-3">
        <h3 className="text-[16px] font-semibold">🤫 Secrets</h3>
        <span className="text-[13px] text-ink-3">{found} of {SECRETS.length} found</span>
      </div>
      <p className="mt-3 text-[13px] text-ink-2">Hidden until you stumble into them. Tap one for a hint.</p>
      <ul className="mt-3 grid grid-cols-6 justify-items-center gap-1.5">
        {SECRETS.map((s) => {
          const state = stateOf(s.id, collected, evaluation.unlocked);
          const def = achievementById.get(s.id)!;
          return (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s.id)} aria-label={state === 'locked' ? 'Secret, locked' : `${s.name}, ${state === 'ready' ? 'ready to collect' : 'collected'}`} className="press block rounded-[10px]">
                <MiniCard def={def} state={state} secretHidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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

// ── Themes ──────────────────────────────────────────────────────────────────

function ThemesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { uid, metrics } = useData();
  const active = metrics.filter((m) => !m.archivedAt);
  return (
    <Sheet open={open} onClose={onClose} title="Themes">
      <p className="text-[14px] text-ink-2">
        A metric’s theme decides which themed cards it counts toward: time on a Study metric can earn Academic Menace, days on a Fitness one Gym Rat.
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
                  aria-label={`Theme for ${m.name}`}
                  className={`${inputClass} w-auto max-w-[11rem] shrink-0`}
                  value={themeOf(m)}
                  onChange={(e) => setMetricTheme(uid, m.id, e.target.value as ThemeId)}
                >
                  {THEMES.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[13px] text-ink-3">Changing a theme moves that metric’s history to the new theme’s cards. Cards you’ve collected stay yours.</p>
      <Button className="mt-4 w-full" onClick={onClose}>Done</Button>
    </Sheet>
  );
}
