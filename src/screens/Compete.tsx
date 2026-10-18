import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Copy, Crown, Frown, Gift, Plus, Share2, Timer, Trophy } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useData } from '../state/DataContext';
import { useCompete } from '../state/CompeteContext';
import { useHue } from '../state/theme';
import { addDays, formatLocalDate, formatTimeIn, instantAt, localDateOf } from '../lib/dates';
import { weekOf } from '../lib/streaks';
import { formatValue } from '../lib/format';
import { iconFor } from '../lib/icons';
import {
  canJoin, canLink, challengeResult, challengeSpan, isTimed, logInWindow, nameFromEmail, normalizeCode, race, sideAt, sideForChallenge, sideMetricIds,
  type Challenge, type Outcome, type ChallengeKind, type ChallengeResult, type Link, type SharedLog, type SharedMetric, type Side,
} from '../lib/compete';
import {
  acceptLink, addToSide, answerChallenge, cancelChallenge, cancelInvite, createInvite, endLink, endPair, joinWithCode, proposeChallenge, proposeLink,
  removeFromSide, renameInPair, restoreSide,
  type JoinError,
} from '../lib/competeRepo';
import { Button, FieldError, Label, Segmented, Sheet, Switch, cx, inputClass, useBump, useToast } from '../components/ui';
import { Confetti } from '../components/Confetti';
import { taunt, type TauntFacts, type TauntKind } from '../lib/taunts';
import { local } from '../lib/device';
import { fmtDay } from '../components/Goals';
import type { Metric } from '../lib/types';

/** Two linked accounts race on linked metrics, week by week, plus challenges either can start. */
export function Compete() {
  const { ready, pair } = useCompete();
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <h1 className="mb-4 text-[22px] font-semibold tracking-tight">Compete</h1>
      {!ready ? null : pair ? <Paired /> : <PairSetup />}
    </div>
  );
}

const ago = (iso: string) => (Date.now() - Date.parse(iso) < 60_000 ? 'just now' : formatDistanceToNowStrict(new Date(iso), { addSuffix: true }));

// ── Pairing ────────────────────────────────────────────────────────────────

const JOIN_ERRORS: Record<JoinError, string> = {
  offline: 'Couldn’t check that code. Joining needs a connection; try again when you’re online.',
  not_found: 'No invite with that code. Check it with the person who sent it; it may have been used or cancelled.',
  expired: 'That invite has expired. Ask for a new code.',
  own: 'That’s your own invite. Send it to the other person to enter on their phone.',
};

function PairSetup() {
  const { uid, user, weekStartsOn } = useData();
  const { invite } = useCompete();
  const toast = useToast();
  const [name, setName] = useState(() => nameFromEmail(user.email));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const share = async (c: string) => {
    const text = `Race me on Logbook: open Compete and enter the code ${c}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(c);
        toast('Code copied');
      }
    } catch { /* share sheet closed */ }
  };

  const join = async () => {
    const c = normalizeCode(code);
    if (!c) return setError('A code is six letters and numbers.');
    if (!name.trim()) return setError('Enter the name they’ll see.');
    setError(null);
    setJoining(true);
    const r = await joinWithCode(uid, name, c);
    setJoining(false);
    if (r.ok) toast('Linked');
    else setError(JOIN_ERRORS[r.error]);
  };

  return (
    <div className="flex flex-col gap-6" data-tour="compete-pair">
      <p className="text-[15px] text-ink-2">
        Link up with one other person and race each other on a metric you both track: whose total is higher each week, how many days you
        each hit your target, and challenges either of you can start. They only see daily totals for the metrics you link. During a
        challenge you both also see each other’s logs on that metric, notes included, so nobody can fudge it. Nothing else is shared.
      </p>

      <section>
        <Label htmlFor="c-name">Your name</Label>
        <input id="c-name" className={inputClass} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <p className="mt-1.5 text-[13px] text-ink-3">What the other person sees.</p>
      </section>

      <section className="rounded-xl border border-line bg-s1 p-4">
        <h2 className="text-[15px] font-medium">Invite someone</h2>
        {invite ? (
          <>
            <p className="mt-1 text-[14px] text-ink-2">Send them this code. They enter it in Compete on their phone, and this page updates by itself.</p>
            <p className="mt-3 text-center text-[32px] font-semibold tracking-[0.25em]" data-testid="invite-code">{invite.code}</p>
            <p className="text-center text-[13px] text-ink-3">Expires {formatLocalDate(invite.expiresAt.slice(0, 10), 'd MMM')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={() => share(invite.code)}>
                {'share' in navigator ? <Share2 size={17} /> : <Copy size={17} />} Send code
              </Button>
              <Button onClick={() => cancelInvite(invite.code)}>Cancel invite</Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[14px] text-ink-2">Get a code to send them.</p>
            <Button
              className="mt-3 w-full"
              variant="primary"
              onClick={() => {
                if (!name.trim()) return setError('Enter the name they’ll see.');
                createInvite(uid, name, weekStartsOn);
              }}
            >
              Create invite code
            </Button>
          </>
        )}
      </section>

      <form className="rounded-xl border border-line bg-s1 p-4" noValidate onSubmit={(e) => { e.preventDefault(); void join(); }}>
        <h2 className="text-[15px] font-medium">Got a code?</h2>
        <div className="mt-3 flex gap-2">
          <input
            aria-label="Invite code"
            className={cx(inputClass, 'uppercase tracking-widest')}
            value={code}
            maxLength={9}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABC234"
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={joining}>{joining ? 'Joining…' : 'Join'}</Button>
        </div>
        <FieldError>{error}</FieldError>
      </form>
    </div>
  );
}

// ── Paired ─────────────────────────────────────────────────────────────────

type Tab = 'races' | 'challenges' | 'history';
const TAB_KEY = 'pt.compete.tab';
const readTab = (): Tab => {
  const t = local.get(TAB_KEY);
  return t === 'challenges' || t === 'history' ? t : 'races';
};

function Paired() {
  const { uid, metricById } = useData();
  const { pair, partnerUid, partnerName, links, challenges, theirScore } = useCompete();
  const result = useChallengeResult();
  const [tab, setTabState] = useState<Tab>(readTab);
  const [linkSheet, setLinkSheet] = useState(false);
  const [challengeSheet, setChallengeSheet] = useState(false);
  const [teamLink, setTeamLink] = useState<string | null>(null);
  if (!pair || !partnerUid) return null;

  const setTab = (t: Tab) => {
    local.set(TAB_KEY, t);
    setTabState(t);
  };
  const accepted = links.filter((l) => l.acceptedAt && metricById.has(l.metrics[uid]));
  const theirProposals = links.filter((l) => !l.acceptedAt && l.proposedBy !== uid);
  const challengeRequests = challenges.filter((c) => !c.acceptedAt && !c.declinedAt && !c.cancelledAt && c.createdBy !== uid);
  const liveCount = challenges.filter((c) => {
    const r = result(c);
    return !!r && LIVE.includes(r.status) && !(r.status === 'pending' && c.createdBy !== uid);
  }).length;
  const teamFor = links.find((l) => l.id === teamLink);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Scoreboard />
        <p className="mt-2 px-1 text-[13px] text-ink-3" data-testid="freshness">
          {theirScore ? `${partnerName}’s numbers updated ${ago(theirScore.updatedAt)}.` : `${partnerName} hasn’t shared any numbers yet.`} Theirs update
          whenever they open the app.
        </p>
      </div>

      <Results />

      {(theirProposals.length > 0 || challengeRequests.length > 0) && (
        <section aria-label="Requests" className="flex flex-col gap-3">
          <h2 className="text-[13px] font-medium text-ink-3">Waiting for you</h2>
          {theirProposals.map((l) => <LinkRequest key={l.id} link={l} />)}
          {challengeRequests.map((c) => <ChallengeCard key={c.id} ch={c} onTeam={setTeamLink} />)}
        </section>
      )}

      <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-4 bg-bg/90 px-4 py-2 backdrop-blur-sm md:top-0" data-tour="compete-tabs" data-testid="compete-tabs">
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'races', label: accepted.length > 1 ? `Races · ${accepted.length}` : 'Races' },
            { value: 'challenges', label: liveCount > 0 ? `Challenges · ${liveCount}` : 'Challenges' },
            { value: 'history', label: 'History' },
          ]}
        />
      </div>

      <div key={tab} className="screen-in">
        {tab === 'races' && <RacesTab onLink={() => setLinkSheet(true)} onTeam={setTeamLink} />}
        {tab === 'challenges' && <Challenges onNew={() => setChallengeSheet(true)} canCreate={accepted.length > 0} onTeam={setTeamLink} />}
        {tab === 'history' && <HistoryTab />}
      </div>

      <Sheet open={linkSheet} onClose={() => setLinkSheet(false)} title="Link a metric">
        {linkSheet && <LinkForm onDone={() => setLinkSheet(false)} />}
      </Sheet>
      <Sheet open={challengeSheet} onClose={() => setChallengeSheet(false)} title="New challenge">
        {challengeSheet && <ChallengeForm onDone={() => setChallengeSheet(false)} />}
      </Sheet>
      <Sheet open={!!teamFor} onClose={() => setTeamLink(null)} title="Metrics in this race">
        {teamFor && <TeamForm link={teamFor} />}
      </Sheet>
    </div>
  );
}

/** Head to head: weeks and challenges each side has won, across every race. */
function Scoreboard() {
  const { uid, today, metricById } = useData();
  const { pair, links, challenges, sides, theirScore, partnerUid, partnerName, myName } = useCompete();
  const result = useChallengeResult();
  const first = links.find((l) => l.acceptedAt && metricById.has(l.metrics[uid]));
  const myHue = useHue((first && metricById.get(first.metrics[uid])?.color) ?? '#8590a3');
  const theirHue = useHue((first && partnerUid && theirScore?.metrics[first.metrics[partnerUid]]?.color) || '#8590a3');
  if (!pair) return null;

  const weeks = { me: 0, them: 0, draws: 0 };
  for (const l of links) {
    if (!l.acceptedAt || !l.startDate) continue;
    const s = sides(l);
    const r = race(s.mine, s.theirs, l.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn);
    weeks.me += r.wins;
    weeks.them += r.losses;
    weeks.draws += r.draws;
  }
  const won = { me: 0, them: 0, draws: 0 };
  for (const c of challenges) {
    const r = result(c);
    if (r?.status !== 'finished') continue;
    if (r.winner === 'me') won.me++;
    else if (r.winner === 'them') won.them++;
    else won.draws++;
  }
  const rows = [
    { label: 'Weeks won', ...weeks },
    { label: 'Challenges won', ...won },
  ];
  const lead = weeks.me + won.me - (weeks.them + won.them);

  return (
    <section aria-label="Scoreboard" className="rounded-2xl border border-line bg-s1 px-4 pt-4 pb-2" data-testid="scoreboard" data-tour="compete-score">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Player name={myName} who="You" hue={myHue} leader={lead > 0} />
        <span aria-hidden className="text-[12px] font-semibold tracking-[0.2em] text-ink-3">VS</span>
        <Player name={partnerName} who="Them" hue={theirHue} leader={lead < 0} right />
      </div>
      <div className="mt-3 divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2" data-testid="score-row">
            <span className={cx('text-[26px] leading-none font-semibold tabular-nums', r.me < r.them && 'text-ink-3')} aria-label={`You ${r.me}`}>{r.me}</span>
            <span className="text-center text-[12px] text-ink-3">
              {r.label}
              {r.draws > 0 && <span className="block">{r.draws} drawn</span>}
            </span>
            <span className={cx('text-right text-[26px] leading-none font-semibold tabular-nums', r.them < r.me && 'text-ink-3')} aria-label={`${partnerName} ${r.them}`}>{r.them}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Player({ name, who, hue, leader, right }: { name: string; who: string; hue: string; leader: boolean; right?: boolean }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5', right && 'flex-row-reverse text-right')}>
      <span
        aria-hidden
        className="relative grid size-10 shrink-0 place-items-center rounded-full text-[16px] font-semibold"
        style={{ background: `color-mix(in srgb, ${hue} 22%, var(--s2))`, color: hue, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${hue} 55%, transparent)` }}
      >
        {name.trim().charAt(0).toUpperCase() || '?'}
        {leader && <Crown size={15} className="crown-in absolute -top-2 text-[#e0a03a]" fill="currentColor" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[16px] font-semibold">{name}</span>
        <span className="block text-[12px] text-ink-3">{leader ? 'Leading' : who}</span>
      </span>
    </div>
  );
}

function RacesTab({ onLink, onTeam }: { onLink: () => void; onTeam: (linkId: string) => void }) {
  const { uid, metricById } = useData();
  const { pair, partnerName, links } = useCompete();
  if (!pair) return null;
  const accepted = links.filter((l) => l.acceptedAt && metricById.has(l.metrics[uid]));
  const myProposals = links.filter((l) => !l.acceptedAt && l.proposedBy === uid);
  return (
    <section aria-label="Weekly races" data-tour="compete-race">
      {accepted.length === 0 && myProposals.length === 0 && (
        <p className="mb-3 text-[14px] text-ink-2">Link one of your metrics to one of {partnerName}’s to start racing, like your Studying against theirs.</p>
      )}
      <div className="flex flex-col gap-3">
        {accepted.map((l) => <RaceCard key={l.id} link={l} onTeam={() => onTeam(l.id)} />)}
        {myProposals.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-[14px]">
            <span className="text-ink-2">Waiting for {partnerName} to pick a metric to race your {metricById.get(l.metrics[uid])?.name ?? 'metric'}.</span>
            <Button variant="ghost" className="shrink-0 px-3" onClick={() => endLink(pair.id, l.id)}>Withdraw</Button>
          </div>
        ))}
      </div>
      <Button className="mt-3 w-full" onClick={onLink}>Link a metric</Button>
    </section>
  );
}

/** Past weeks per race, finished challenges, and the pair itself (name, unlink). */
function HistoryTab() {
  const { uid, today, metricById } = useData();
  const { pair, partnerName, links, challenges, sides, theirScore } = useCompete();
  const result = useChallengeResult();
  const [allWeeks, setAllWeeks] = useState(false);
  const [allChallenges, setAllChallenges] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  if (!pair) return null;

  const weeks: { key: string; title: string; start: string; end: string; outcome: Outcome | null; score: string }[] = [];
  for (const l of links) {
    const metric = metricById.get(l.metrics[uid]);
    if (!l.acceptedAt || !l.startDate || !metric) continue;
    const s = sides(l);
    const r = race(s.mine, s.theirs, l.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn);
    for (const w of r.past) {
      weeks.push({
        key: `${l.id}:${w.start}`,
        title: sideAt(s.mine, w.end)?.name ?? metric.name,
        start: w.start,
        end: w.end,
        outcome: w.outcome,
        score: `${formatValue(metric, w.me.total)} – ${formatValue(metric, w.them.total)}`,
      });
    }
  }
  weeks.sort((a, b) => b.start.localeCompare(a.start));
  const done = challenges.flatMap((c) => {
    const r = result(c);
    return r?.status === 'finished' ? [{ c, r }] : [];
  }).reverse();
  const verdict = (o: Outcome | null) => (o === 'me' ? 'You won' : o === 'them' ? `${partnerName} won` : o === 'draw' ? 'Draw' : 'Waiting');

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="weeks-h">
        <h2 id="weeks-h" className="mb-1 text-[15px] font-medium">Past weeks</h2>
        {weeks.length === 0 ? (
          <p className="text-[14px] text-ink-2">Finished weeks show up here, with who took each one.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line" data-testid="past-weeks">
            {(allWeeks ? weeks : weeks.slice(0, 6)).map((w) => (
              <li key={w.key} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                <span className="min-w-0">
                  <span className="block truncate">{w.title}</span>
                  <span className="block text-[12px] text-ink-3">{formatLocalDate(w.start, 'd MMM')} – {formatLocalDate(w.end, 'd MMM')} · {w.score}</span>
                </span>
                <OutcomeTag outcome={w.outcome} label={verdict(w.outcome)} />
              </li>
            ))}
          </ul>
        )}
        {weeks.length > 6 && !allWeeks && (
          <button type="button" className="mt-2 text-[13px] text-ink-2 underline underline-offset-2" onClick={() => setAllWeeks(true)}>Show all</button>
        )}
      </section>

      <section aria-labelledby="done-h">
        <h2 id="done-h" className="mb-1 text-[15px] font-medium">Finished challenges</h2>
        {done.length === 0 ? (
          <p className="text-[14px] text-ink-2">Nothing settled yet.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line" data-testid="finished-challenges">
            {(allChallenges ? done : done.slice(0, 5)).map(({ c }) => {
              const r = result(c)!;
              return (
                <li key={c.id} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0">
                    <span className="block truncate">{challengeTitleFor(c, links, uid, sides, metricById)}</span>
                    {c.stake && <span className="block truncate text-[12px] text-ink-3">Winner got {c.stake}</span>}
                  </span>
                  <OutcomeTag outcome={r.winner} label={verdict(r.winner)} />
                </li>
              );
            })}
          </ul>
        )}
        {done.length > 5 && !allChallenges && (
          <button type="button" className="mt-2 text-[13px] text-ink-2 underline underline-offset-2" onClick={() => setAllChallenges(true)}>Show all</button>
        )}
      </section>

      <section aria-labelledby="pair-h" className="flex flex-col gap-3 border-t border-line pt-5">
        <h2 id="pair-h" className="text-[15px] font-medium">You and {partnerName}</h2>
        <NameRow />
        {confirmUnlink ? (
          <div className="rounded-lg bg-s2 p-3 text-[14px] text-ink-2">
            Unlink from {partnerName}? You stop sharing numbers with each other and every race and challenge ends. You can link again later with a new code.
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="danger" onClick={() => endPair(pair.id)}>Unlink</Button>
              <Button onClick={() => setConfirmUnlink(false)}>Keep</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmUnlink(true)}>Unlink from {partnerName}</Button>
        )}
      </section>
    </div>
  );
}

function OutcomeTag({ outcome, label }: { outcome: Outcome | null; label: string }) {
  return (
    <span
      className={cx(
        'shrink-0 rounded-full px-2.5 py-0.5 text-[13px]',
        outcome === 'me' ? 'bg-[#e0a03a]/15 font-medium text-ink' : outcome === 'them' ? 'bg-s2 text-ink-2' : 'text-ink-3',
      )}
    >
      {label}
    </span>
  );
}

/**
 * The metrics on each side of a race. Mine can be added and removed freely;
 * they're summed. Theirs are listed; they change them on their own phone.
 */
function TeamForm({ link }: { link: Link }) {
  const { uid, today, metrics, metricById } = useData();
  const { pair, links, partnerUid, partnerName, theirScore } = useCompete();
  const toast = useToast();
  const first = metricById.get(link.metrics[uid]);
  const used = new Set(links.flatMap((l) => sideMetricIds(l, uid)));
  const options = first ? metrics.filter((m) => !used.has(m.id) && canJoin(m, link, first.unit)) : [];
  const [pick, setPick] = useState(options[0]?.id ?? '');
  const [removing, setRemoving] = useState<string | null>(null);
  if (!pair || !first) return null;
  const picked = options.find((m) => m.id === pick) ?? options[0];
  const added = (link.extra?.[uid] ?? []).filter((x) => !x.removedOn);
  const theirIds = partnerUid ? sideMetricIds(link, partnerUid) : [];

  return (
    <div className="mt-2 flex flex-col gap-5" data-testid="team-sheet">
      <section>
        <h3 className="text-[13px] font-medium text-ink-3">Your side</h3>
        <ul className="mt-1 divide-y divide-line border-y border-line">
          <TeamRow name={first.name} color={first.color} note="From the start" />
          {added.map((x) => {
            const m = metricById.get(x.metricId);
            return (
              <TeamRow key={x.metricId} name={m?.name ?? 'Deleted metric'} color={m?.color} note={`Added ${fmtDay(x.addedOn, today).toLowerCase()}`}>
                {removing === x.metricId ? (
                  <span className="flex gap-1">
                    <Button variant="danger" className="min-h-9 px-3 text-[14px]" onClick={() => {
                      removeFromSide(pair.id, link, uid, x.metricId, today);
                      setRemoving(null);
                      toast(`${m?.name ?? 'Metric'} taken off your side`);
                    }}>Remove</Button>
                    <Button variant="ghost" className="min-h-9 px-3 text-[14px]" onClick={() => setRemoving(null)}>Keep</Button>
                  </span>
                ) : (
                  <Button variant="ghost" className="min-h-9 px-3 text-[14px]" onClick={() => setRemoving(x.metricId)}>Remove</Button>
                )}
              </TeamRow>
            );
          })}
        </ul>
        {removing && (
          <p className="mt-1.5 text-[13px] text-ink-3">It stops counting toward this week and every challenge still running. Finished ones keep it.</p>
        )}
      </section>

      {options.length > 0 && picked ? (
        <form noValidate onSubmit={(e) => {
          e.preventDefault();
          const before = link.extra?.[uid] ?? [];
          addToSide(pair.id, link, uid, picked.id, today);
          toast(`${picked.name} added to your side`, { label: 'Undo', run: () => restoreSide(pair.id, link.id, uid, before) });
        }}>
          <Label htmlFor="t-add">Add one of yours</Label>
          <div className="flex gap-2">
            <select id="t-add" className={inputClass} value={picked.id} onChange={(e) => setPick(e.target.value)}>
              {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <Button type="submit" variant="primary" className="shrink-0"><Plus size={17} aria-hidden /> Add</Button>
          </div>
        </form>
      ) : (
        <p className="text-[14px] text-ink-2">
          No other {first.type === 'duration' ? 'time' : first.unit} metrics to add. Races take “at least” metrics of the same kind, each on one race at a time.
        </p>
      )}
      <p className="-mt-2 text-[13px] text-ink-3">
        Everything on your side is added together. A new one counts toward this week and every challenge still running on this race, from their
        start; finished weeks and challenges stay as they were. A day is a target day if you hit any of their targets. {partnerName} sees their daily
        totals, and their logs and notes during challenges.
      </p>

      <section>
        <h3 className="text-[13px] font-medium text-ink-3">{partnerName}’s side</h3>
        <ul className="mt-1 divide-y divide-line border-y border-line">
          {theirIds.map((id) => {
            const m = theirScore?.metrics[id];
            return <TeamRow key={id} name={m?.name ?? 'Not shared yet'} color={m?.color} />;
          })}
        </ul>
        <p className="mt-1.5 text-[13px] text-ink-3">{partnerName} adds theirs from their own phone.</p>
      </section>
    </div>
  );
}

function TeamRow({ name, color, note, children }: { name: string; color?: string; note?: string; children?: ReactNode }) {
  const hue = useHue(color ?? '#8590a3');
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-1.5 text-[15px]" data-testid="team-row">
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: hue }} />
        <span className="min-w-0">
          <span className="block truncate">{name}</span>
          {note && <span className="block text-[12px] text-ink-3">{note}</span>}
        </span>
      </span>
      {children}
    </li>
  );
}

/** The name the other person sees, editable in place. */
function NameRow() {
  const { uid } = useData();
  const { pair, myName, partnerName } = useCompete();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(myName);
  const [error, setError] = useState<string | null>(null);
  if (!pair) return null;

  if (!editing) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 text-[14px]">
        <span className="min-w-0 text-ink-2">
          {partnerName} sees you as <span className="font-medium text-ink" data-testid="my-name">{myName}</span>
        </span>
        <Button variant="ghost" className="shrink-0 px-3" onClick={() => { setName(myName); setError(null); setEditing(true); }}>Change</Button>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return setError('Enter a name.');
      if (name.trim() !== myName) {
        renameInPair(pair.id, uid, name);
        toast(`${partnerName} now sees you as ${name.trim()}`);
      }
      setEditing(false);
    }}>
      <Label htmlFor="c-rename">Your name</Label>
      <div className="flex gap-2">
        <input id="c-rename" className={inputClass} value={name} maxLength={30} autoFocus onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
        <Button type="submit" variant="primary" className="shrink-0">Save</Button>
      </div>
      <FieldError>{error}</FieldError>
      <button type="button" className="mt-1.5 text-[13px] text-ink-3 underline underline-offset-2" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

/** My metrics that can go into a new link: the right kind, and not already on a side of one (linked, added or proposed). */
function useFreeMetrics(): Metric[] {
  const { uid, metrics } = useData();
  const { links } = useCompete();
  const used = new Set(links.flatMap((l) => sideMetricIds(l, uid)));
  return metrics.filter((m) => canLink(m) && !used.has(m.id));
}

const typeWord = (t: Metric['type']) => (t === 'duration' ? 'time' : 'count');

function LinkForm({ onDone }: { onDone: () => void }) {
  const { uid } = useData();
  const { pair, partnerName } = useCompete();
  const toast = useToast();
  const free = useFreeMetrics();
  const [metricId, setMetricId] = useState(free[0]?.id ?? '');
  const metric = free.find((m) => m.id === metricId);
  if (!pair) return null;
  if (free.length === 0) {
    return <p className="mt-2 text-[15px] text-ink-2">All your metrics that can be raced on are already linked. Races work on “at least” metrics, like study time.</p>;
  }
  return (
    <form noValidate className="mt-2 flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      if (!metric) return;
      proposeLink(pair.id, uid, metric.id, metric.type);
      toast(`Sent to ${partnerName}`);
      onDone();
    }}>
      <div>
        <Label htmlFor="l-metric">Your metric</Label>
        <select id="l-metric" className={inputClass} value={metricId} onChange={(e) => setMetricId(e.target.value)}>
          {free.map((m) => <option key={m.id} value={m.id}>{m.name} ({typeWord(m.type)})</option>)}
        </select>
      </div>
      <p className="text-[14px] text-ink-2">
        {partnerName} then picks one of theirs to race it against. It has to be a {metric ? typeWord(metric.type) : ''} metric too. Its daily totals and
        target days are shared, and during a challenge each log on it, with its note.
      </p>
      <Button type="submit" variant="primary">Send to {partnerName}</Button>
    </form>
  );
}

function LinkRequest({ link }: { link: Link }) {
  const { uid, today } = useData();
  const { pair, partnerName, partnerUid, theirScore } = useCompete();
  const toast = useToast();
  const options = useFreeMetrics().filter((m) => m.type === link.type);
  const [metricId, setMetricId] = useState(options[0]?.id ?? '');
  if (!pair || !partnerUid) return null;
  const theirs = theirScore?.metrics[link.metrics[partnerUid]]?.name;
  return (
    <div className="rounded-xl border border-line bg-s1 p-4" data-testid="link-request">
      <p className="text-[15px]">
        <span className="font-medium">{partnerName}</span> wants to race {theirs ? <>their <span className="font-medium">{theirs}</span></> : <>a {typeWord(link.type)} metric</>}.
      </p>
      {options.length === 0 ? (
        <p className="mt-2 text-[14px] text-ink-2">You have no free “at least” {typeWord(link.type)} metric to race with. Create one under Metrics, then come back.</p>
      ) : (
        <>
          <Label htmlFor={`lr-${link.id}`}><span className="mt-3 block">Race it against your</span></Label>
          <select id={`lr-${link.id}`} className={inputClass} value={metricId} onChange={(e) => setMetricId(e.target.value)}>
            {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="primary" disabled={!metricId} onClick={() => {
          acceptLink(pair.id, link.id, uid, metricId, weekOf(today, pair.weekStartsOn));
          toast('Race on');
        }}>Accept</Button>
        <Button onClick={() => endLink(pair.id, link.id)}>Decline</Button>
      </div>
    </div>
  );
}

// ── Weekly race ────────────────────────────────────────────────────────────

/** Names on each side of a link now. */
function useSideNames(link: Link): { mine: string[]; theirs: string[] } {
  const { uid, metricById } = useData();
  const { partnerUid, theirScore } = useCompete();
  return {
    mine: sideMetricIds(link, uid).map((id) => metricById.get(id)?.name).filter((n): n is string => !!n),
    theirs: partnerUid ? sideMetricIds(link, partnerUid).map((id) => theirScore?.metrics[id]?.name).filter((n): n is string => !!n) : [],
  };
}

/** "Studying vs Study", or "Network+ & Study vs Study"; the other side only when it differs. */
function SidesTitle({ link }: { link: Link }) {
  const names = useSideNames(link);
  const mine = names.mine.join(' & ');
  const theirs = names.theirs.join(' & ');
  return (
    <>
      {mine}
      {theirs && theirs !== mine && <span className="font-normal text-ink-3"> vs {theirs}</span>}
    </>
  );
}

function AddMetricButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="min-h-9 shrink-0 gap-1.5 px-2.5 text-[14px]" onClick={onClick} data-tour="compete-team">
      <Plus size={16} aria-hidden /> Add metric
    </Button>
  );
}

function RaceCard({ link, onTeam }: { link: Link; onTeam: () => void }) {
  const { uid, today, metricById } = useData();
  const { pair, partnerUid, partnerName, myName, theirScore, sides } = useCompete();
  const [confirmStop, setConfirmStop] = useState(false);
  const names = useSideNames(link);
  const metric = metricById.get(link.metrics[uid]);
  const theirFirst = partnerUid ? theirScore?.metrics[link.metrics[partnerUid]] : undefined;
  const myHue = useHue(metric?.color ?? '#8590a3');
  const theirHue = useHue(theirFirst?.color ?? '#8590a3');
  const s = sides(link);
  const r = pair && link.startDate ? race(s.mine, s.theirs, link.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn) : null;
  const current = r?.current;
  // Pops the verdict when the lead changes hands.
  const verdictBump = useBump(!current || current.me.total === current.them.total ? 'level' : current.me.total > current.them.total ? 'me' : 'them');
  if (!pair || !metric || !r) return null;
  const Icon = iconFor(metric.icon);
  const { me, them } = r.current;
  const gap = me.total - them.total;
  const top = Math.max(me.total, them.total);
  const last = r.past[0];
  const label = names.mine.join(' & ') || metric.name;

  return (
    <article className="rounded-xl border border-line bg-s1 p-4" data-testid="race-card">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-medium">
            <Icon size={17} style={{ color: myHue }} aria-hidden className="shrink-0" />
            <span className="min-w-0"><SidesTitle link={link} /></span>
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            This week · {formatLocalDate(r.current.start, 'd MMM')} – {formatLocalDate(r.current.end, 'd MMM')}
          </p>
        </div>
        <AddMetricButton onClick={onTeam} />
      </header>

      <div className="mt-3 flex flex-col gap-2.5">
        <Contender label="You" value={formatValue(metric, me.total)} suffix={targetDays(me)} pct={top ? me.total / top : 0} hue={myHue} leader={gap > 0} />
        <Contender label={partnerName} value={formatValue(metric, them.total)} suffix={targetDays(them)} pct={top ? them.total / top : 0} hue={theirHue} leader={gap < 0} />
      </div>

      <Bubble
        kind={raceTaunt(me.total, them.total)}
        seed={`${link.id}:${today}`}
        facts={tauntFacts(myName, partnerName, { ...metric, name: label }, sideAt(s.mine, r.current.end), sideAt(s.theirs, r.current.end), gap, today)}
        myHue={myHue}
        theirHue={theirHue}
      />
      <p key={verdictBump} className={cx('mt-3 text-[14px] font-medium', verdictBump > 0 && 'bump')} data-testid="race-verdict">
        {gap === 0 ? (me.total === 0 ? 'Nothing logged yet this week' : 'Level') : gap > 0 ? `You’re ${formatValue(metric, gap)} ahead` : `${partnerName} is ${formatValue(metric, -gap)} ahead`}
      </p>
      <p className="mt-1 text-[13px] text-ink-2" data-testid="race-tally">
        Weeks won: you {r.wins} · {partnerName} {r.losses}
        {r.draws > 0 && ` · ${r.draws} ${r.draws === 1 ? 'draw' : 'draws'}`}
      </p>
      {last && (
        <p className="mt-0.5 text-[13px] text-ink-3">
          Last week:{' '}
          {last.outcome === null
            ? `waiting for ${partnerName}’s numbers`
            : `${last.outcome === 'me' ? 'you won' : last.outcome === 'them' ? `${partnerName} won` : 'a draw'}, ${formatValue(metric, last.me.total)} to ${formatValue(metric, last.them.total)}`}
        </p>
      )}

      {confirmStop ? (
        <div className="mt-3 rounded-lg bg-s2 p-3 text-[14px] text-ink-2">
          Stop racing on {label}? The weeks won so far go with it.
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="danger" onClick={() => endLink(pair.id, link.id)}>Stop racing</Button>
            <Button onClick={() => setConfirmStop(false)}>Keep</Button>
          </div>
        </div>
      ) : (
        <button type="button" className="mt-2 text-[13px] text-ink-3 underline underline-offset-2" onClick={() => setConfirmStop(true)}>Stop racing</button>
      )}
    </article>
  );
}

const targetDays = (side: Side) => (side.hasTarget ? `target ${side.hits}/${side.due} ${side.due === 1 ? 'day' : 'days'}` : undefined);

function raceTaunt(me: number, them: number): TauntKind {
  if (me === 0 && them === 0) return 'bothIdle';
  if (me === 0) return 'idle';
  return me === them ? 'level' : me > them ? 'ahead' : 'behind';
}

/**
 * What the trash talk can use: names, the metric, the margin, and today's
 * totals and log counts (logs only on a challenge day, when both are shared).
 */
function tauntFacts(
  me: string,
  them: string,
  metric: Pick<Metric, 'name' | 'type' | 'unit'>,
  mineShared: SharedMetric | undefined,
  theirs: SharedMetric | undefined,
  gap: number,
  today: string,
  fmtGap: (v: number) => string = (v) => formatValue(metric, v),
): TauntFacts {
  const myLogs = mineShared?.logs?.[today];
  const theirLogs = theirs?.logs?.[today];
  return {
    me,
    them,
    metric: metric.name,
    gap: gap !== 0 ? fmtGap(Math.abs(gap)) : undefined,
    today: { me: mineShared?.days[today]?.t ?? 0, them: theirs?.days[today]?.t ?? 0, fmt: (v) => formatValue(metric, v) },
    logs: myLogs && theirLogs ? { me: myLogs.length, them: theirLogs.length } : undefined,
  };
}

/**
 * The trash talk, as a speech bubble from whoever's winning: mine on the
 * right in my colour, theirs on the left in theirs, the ref's in the middle.
 */
function Bubble({ kind, seed, facts, myHue, theirHue, className }: {
  kind: TauntKind; seed: string; facts: TauntFacts; myHue: string; theirHue: string; className?: string;
}) {
  const { line, speaker } = taunt(kind, seed, facts);
  const hue = speaker === 'me' ? myHue : speaker === 'them' ? theirHue : 'var(--ink-3)';
  const fill = `color-mix(in srgb, ${hue} 18%, var(--s1))`;
  const edge = `color-mix(in srgb, ${hue} 60%, transparent)`;
  return (
    <figure
      key={line}
      className={cx('mt-4 flex flex-col', speaker === 'me' ? 'items-end' : speaker === 'them' ? 'items-start' : 'items-center', className)}
      data-testid="taunt"
      data-speaker={speaker}
    >
      <blockquote
        className={cx(
          'bubble-in relative max-w-[92%] rounded-2xl border-[1.5px] px-4 py-2.5 text-[16px] leading-snug font-semibold text-ink',
          speaker === 'me' ? 'origin-bottom-right' : speaker === 'them' ? 'origin-bottom-left' : 'origin-bottom',
        )}
        style={{ background: fill, borderColor: edge }}
      >
        {line}
        <span
          aria-hidden
          className={cx('absolute -bottom-[7px] size-3 rotate-45 border-r-[1.5px] border-b-[1.5px]', speaker === 'me' ? 'right-5' : speaker === 'them' ? 'left-5' : 'left-1/2 -ml-1.5')}
          style={{ background: fill, borderColor: edge }}
        />
      </blockquote>
      <figcaption className="taunt-in mt-2 px-3 text-[12px] text-ink-3">
        {speaker === 'me' ? '— you' : speaker === 'them' ? `— ${facts.them}` : '— the ref'}
      </figcaption>
    </figure>
  );
}

/** One side of a race or challenge: name, figure, and a bar that grows in. The leader gets a crown and a shine. */
function Contender({ label, value, suffix, pct, hue, leader }: { label: string; value: string; suffix?: string; pct: number; hue: string; leader: boolean }) {
  const w = Math.min(100, Math.round(pct * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <span className="truncate">{label}</span>
          {leader && <Crown size={15} aria-label="Leading" className="crown-in shrink-0 self-center text-[#e0a03a]" fill="currentColor" />}
        </span>
        <span className="shrink-0">
          <span className="font-medium">{value}</span>
          {suffix && <span className="ml-2 text-[13px] text-ink-3">{suffix}</span>}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-s3">
        <div className="grow-in bar-fill relative h-full overflow-hidden rounded-full" style={{ width: `${pct > 0 ? Math.max(3, w) : 0}%`, background: hue }}>
          {leader && (
            <span aria-hidden className="leader-shine absolute inset-y-0 w-1/2" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)' }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Results ────────────────────────────────────────────────────────────────

interface Result {
  id: string;
  outcome: Outcome;
  title: string;
  score: string;
  kind: TauntKind;
  facts: TauntFacts;
  myColor: string;
  theirColor: string;
  /** A challenge's prize: who collects it. */
  stake?: string;
}

const SEEN_KEY = 'pt.compete.seen';
const readSeen = (): string[] => {
  try {
    return JSON.parse(local.get(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/**
 * Last week's result on each race and challenges settled in the past two
 * weeks, one at a time, until dismissed on this device: confetti and a
 * trophy for a win, a wobble for a loss.
 */
function Results() {
  const { uid, today, metricById, dayOf } = useData();
  const { pair, links, challenges, sides, theirScore, partnerUid, partnerName, myName } = useCompete();
  const result = useChallengeResult();
  const [seen, setSeen] = useState(readSeen);
  if (!pair) return null;

  const results: Result[] = [];
  for (const l of links) {
    const metric = metricById.get(l.metrics[uid]);
    if (!l.acceptedAt || !l.startDate || !metric) continue;
    const s = sides(l);
    const theirs = partnerUid ? theirScore?.metrics[l.metrics[partnerUid]] : undefined;
    const last = race(s.mine, s.theirs, l.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn).past[0];
    if (!last?.outcome) continue;
    const name = sideAt(s.mine, last.end)?.name ?? metric.name;
    results.push({
      id: `week:${l.id}:${last.start}`,
      outcome: last.outcome,
      title: last.outcome === 'me' ? `You won the week on ${name}` : last.outcome === 'them' ? `${partnerName} took the week on ${name}` : `The week on ${name} was a draw`,
      score: `${formatValue(metric, last.me.total)} to ${formatValue(metric, last.them.total)}`,
      kind: last.outcome === 'me' ? 'wonWeek' : last.outcome === 'them' ? 'lostWeek' : 'drewWeek',
      facts: {
        me: myName,
        them: partnerName,
        metric: name,
        gap: last.me.total !== last.them.total ? formatValue(metric, Math.abs(last.me.total - last.them.total)) : undefined,
      },
      myColor: metric.color,
      theirColor: theirs?.color ?? '#8590a3',
    });
  }
  const recent = addDays(today, -14);
  for (const c of challenges) {
    const link = links.find((l) => l.id === c.linkId);
    const r = result(c);
    if (!link || !r) continue;
    const first = c.kind === 'first_to' ? [r.reached.me, r.reached.them].filter((d): d is string => !!d).sort()[0] : undefined;
    const decided = first ? (isTimed(c) ? dayOf(first) : first) : challengeSpan(c, dayOf).end;
    if (r.status !== 'finished' || !r.winner || decided < recent) continue;
    const m = sideForChallenge(sides(link).mine, c);
    const theirs = partnerUid ? theirScore?.metrics[link.metrics[partnerUid]] : undefined;
    const fmt = (v: number) => (c.kind === 'most_days' ? `${v} ${v === 1 ? 'day' : 'days'}` : m ? formatValue(m, v) : String(v));
    const title = challengeTitle(c, m);
    results.push({
      id: `ch:${c.id}`,
      outcome: r.winner,
      title: r.winner === 'me' ? `You won “${title}”` : r.winner === 'them' ? `${partnerName} won “${title}”` : `“${title}” ended in a draw`,
      score: `${fmt(r.me)} to ${fmt(r.them)}`,
      kind: r.winner === 'me' ? 'wonChallenge' : r.winner === 'them' ? 'lostChallenge' : 'drewChallenge',
      facts: { me: myName, them: partnerName, metric: m?.name, gap: r.me !== r.them ? fmt(Math.abs(r.me - r.them)) : undefined },
      myColor: metricById.get(link.metrics[uid])?.color ?? '#8590a3',
      theirColor: theirs?.color ?? '#8590a3',
      stake: c.stake
        ? r.winner === 'me' ? `You get ${c.stake}` : r.winner === 'them' ? `${partnerName} gets ${c.stake}` : `Nobody gets ${c.stake}`
        : undefined,
    });
  }

  const next = results.find((r) => !seen.includes(r.id));
  if (!next) return null;
  const dismiss = () => {
    const all = [...seen, next.id].slice(-200);
    local.set(SEEN_KEY, JSON.stringify(all));
    setSeen(all);
  };
  return <ResultBanner key={next.id} result={next} onDismiss={dismiss} />;
}

function ResultBanner({ result, onDismiss }: { result: Result; onDismiss: () => void }) {
  const [confetti, setConfetti] = useState(result.outcome === 'me');
  const myHue = useHue(result.myColor);
  const theirHue = useHue(result.theirColor);
  const won = result.outcome === 'me';
  const lost = result.outcome === 'them';
  return (
    <section
      aria-live="polite"
      data-testid="result-banner"
      className={cx(
        'rounded-xl border p-4 text-center',
        won ? 'toast-in border-[#e0a03a]/60 bg-[#e0a03a]/10' : 'border-line bg-s1',
        lost ? 'wobble' : !won && 'toast-in',
      )}
    >
      {confetti && <Confetti origin={{ x: 0.5, y: 0.25 }} onDone={() => setConfetti(false)} />}
      <div className="flex justify-center">
        {won ? (
          <Trophy size={44} className="trophy-in text-[#e0a03a]" fill="currentColor" aria-hidden />
        ) : lost ? (
          <Frown size={44} className="droop text-ink-3" aria-hidden />
        ) : (
          <Crown size={40} className="crown-in text-ink-3" aria-hidden />
        )}
      </div>
      <p className="mt-2 text-[17px] font-semibold">{result.title}</p>
      <p className="mt-0.5 text-[14px] text-ink-2">{result.score}</p>
      {result.stake && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#e0a03a]/15 px-3 py-1 text-[14px] font-medium" data-testid="result-stake">
          <Gift size={15} aria-hidden className="text-[#e0a03a]" /> {result.stake}
        </p>
      )}
      <Bubble kind={result.kind} seed={result.id} facts={result.facts} myHue={myHue} theirHue={theirHue} className="text-left" />
      <Button className="mt-3 min-w-28" variant={won ? 'primary' : 'quiet'} onClick={onDismiss}>
        {won ? 'Gloat' : lost ? 'Ugh, fine' : 'OK'}
      </Button>
    </section>
  );
}

// ── Challenges ─────────────────────────────────────────────────────────────

const LIVE: ChallengeResult['status'][] = ['active', 'upcoming', 'awaiting', 'pending'];

function Challenges({ onNew, canCreate, onTeam }: { onNew: () => void; canCreate: boolean; onTeam: (linkId: string) => void }) {
  const { uid } = useData();
  const { challenges, links, partnerName } = useCompete();
  const result = useChallengeResult();
  // Their open requests are shown at the top of the page instead; finished ones are under History.
  const live = challenges.filter((c) => {
    const r = result(c);
    return !!r && LIVE.includes(r.status) && !(r.status === 'pending' && c.createdBy !== uid);
  });
  const done = challenges.filter((c) => links.some((l) => l.id === c.linkId) && result(c)?.status === 'finished').length;

  return (
    <section aria-label="Challenges" data-tour="compete-challenges">
      {live.length === 0 && (
        <p className="mb-3 text-[14px] text-ink-2">
          {canCreate ? `Start one: first to 20 hours, most this month, or most days hitting your target. ${partnerName} accepts it first.` : 'Link a metric first, then challenge each other on it.'}
          {done > 0 && ` Finished ones are under History.`}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {live.map((c) => <ChallengeCard key={c.id} ch={c} onTeam={onTeam} />)}
      </div>
      <Button className="mt-3 w-full" disabled={!canCreate} onClick={onNew}>New challenge</Button>
    </section>
  );
}

/** Where a challenge stands, from both sides' metrics as they count toward it; null if its race is gone. */
function useChallengeResult(): (c: Challenge) => ChallengeResult | null {
  const { today } = useData();
  const { links, sides, theirScore, now } = useCompete();
  return (c) => {
    const link = links.find((l) => l.id === c.linkId);
    if (!link) return null;
    const s = sides(link);
    return challengeResult(c, s.mine, s.theirs, today, theirScore?.asOf ?? null, now, theirScore?.updatedAt ?? null);
  };
}

/** "First to 20h of Network+ & Study", from my side as it counts toward the challenge. */
function challengeTitle(c: Challenge, m: Pick<SharedMetric, 'name' | 'type' | 'unit'> | undefined): string {
  const name = m?.name ?? 'metric';
  if (c.kind === 'first_to') return `First to ${m && c.amount ? formatValue(m, c.amount) : '…'} of ${name}`;
  if (c.kind === 'most_total') return `Most ${name}`;
  return `Most ${name} target days`;
}

function challengeTitleFor(
  c: Challenge,
  links: Link[],
  uid: string,
  sides: ReturnType<typeof useCompete>['sides'],
  metricById: Map<string, Metric>,
): string {
  const link = links.find((l) => l.id === c.linkId);
  if (!link) return challengeTitle(c, undefined);
  const first = metricById.get(link.metrics[uid]);
  return challengeTitle(c, sideForChallenge(sides(link).mine, c) ?? first);
}

/** A calendar day and time: "Today 18:00", "Sat 18 Oct 09:30". */
function fmtAt(iso: string, tz: string, now: string): string {
  const d = localDateOf(iso, tz);
  const calToday = localDateOf(now, tz);
  const day = d === calToday ? 'Today' : d === addDays(calToday, 1) ? 'Tomorrow' : formatLocalDate(d, d.slice(0, 4) === calToday.slice(0, 4) ? 'EEE d MMM' : 'd MMM yyyy');
  return `${day} ${formatTimeIn(iso, tz)}`;
}

function ChallengeCard({ ch, onTeam }: { ch: Challenge; onTeam: (linkId: string) => void }) {
  const { uid, today, metricById, tz } = useData();
  const { pair, links, sides, theirScore, partnerUid, partnerName, myName, now } = useCompete();
  const toast = useToast();
  const result = useChallengeResult();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const link = links.find((l) => l.id === ch.linkId);
  const metric = link ? metricById.get(link.metrics[uid]) : undefined;
  const theirFirst = link && partnerUid ? theirScore?.metrics[link.metrics[partnerUid]] : undefined;
  const myHue = useHue(metric?.color ?? '#8590a3');
  const theirHue = useHue(theirFirst?.color ?? '#8590a3');
  const r = result(ch);
  if (!pair || !link || !r) return null;
  // Each side as it counts toward this challenge: one metric, or several summed.
  const s = sides(link);
  const myC = sideForChallenge(s.mine, ch);
  const theirC = sideForChallenge(s.theirs, ch);
  const theirs = theirC ?? theirFirst;
  const fmt = (v: number, m?: Pick<Metric, 'type' | 'unit'>) => (ch.kind === 'most_days' ? `${v} ${v === 1 ? 'day' : 'days'}` : formatValue(m ?? metric ?? { type: link.type, unit: '' }, v));
  const max = ch.kind === 'first_to' && ch.amount ? ch.amount : Math.max(r.me, r.them);
  const theirRequest = r.status === 'pending' && ch.createdBy !== uid;

  const when = isTimed(ch)
    ? r.status === 'upcoming' ? `Starts ${fmtAt(ch.startAt, tz, now)}`
      : r.status === 'active' || r.status === 'pending' ? `${fmtAt(ch.startAt, tz, now)} – ${fmtAt(ch.endAt, tz, now)}`
      : `Ended ${fmtAt(ch.endAt, tz, now)}`
    : r.status === 'upcoming' ? `Starts ${fmtDay(ch.startDate, today)}`
    : r.status === 'active' || r.status === 'pending'
      ? ch.endDate === today ? 'Ends today' : `${fmtDay(ch.startDate, today)} – ${fmtDay(ch.endDate, today)}`
      : `Ended ${fmtDay(ch.endDate, today)}`;

  let verdict: string;
  if (r.status === 'pending') verdict = theirRequest ? `${partnerName} challenges you` : `Waiting for ${partnerName} to accept`;
  else if (r.status === 'upcoming') verdict = 'Not started yet';
  else if (r.status === 'awaiting') verdict = `Waiting for ${partnerName}’s numbers to settle it`;
  else if (r.status === 'finished') verdict = r.winner === 'me' ? 'You won' : r.winner === 'them' ? `${partnerName} won` : 'A draw';
  else if (isTimed(ch) && r.reached.me) verdict = `You got there at ${formatTimeIn(r.reached.me, tz)}. Settled once ${partnerName}’s app catches up`;
  else if (ch.kind === 'first_to' && (r.reached.me || r.reached.them)) {
    verdict = r.reached.me && r.reached.them ? 'You both got there today' : r.reached.me ? 'You got there. Settled once the day is over' : `${partnerName} got there. You have until the day is over`;
  } else verdict = r.me === r.them ? 'Level' : r.me > r.them ? `You lead by ${fmt(r.me - r.them)}` : `${partnerName} leads by ${fmt(r.them - r.me, theirs)}`;

  // Finished: the winner. Running: whoever got there first, else whoever's ahead.
  const leader: Outcome | null =
    r.status === 'finished' ? r.winner
    : r.status !== 'active' && r.status !== 'awaiting' ? null
    : r.reached.me && !r.reached.them ? 'me'
    : r.reached.them && !r.reached.me ? 'them'
    : r.me === r.them ? null : r.me > r.them ? 'me' : 'them';
  const tauntKind: TauntKind | null =
    r.status === 'finished' ? (r.winner === 'me' ? 'wonChallenge' : r.winner === 'them' ? 'lostChallenge' : 'drewChallenge')
    : r.status !== 'active' ? null
    : ch.kind === 'first_to' && r.reached.them && !r.reached.me ? 'theyReached'
    : ch.kind === 'first_to' && r.reached.me && !r.reached.them ? 'iReached'
    : raceTaunt(r.me, r.them);

  return (
    <article className={cx('rounded-xl border p-4', theirRequest ? 'border-ink-3 bg-s1' : 'border-line bg-s1')} data-testid="challenge-card">
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[15px] font-medium">{challengeTitle(ch, myC ?? metric)}</h3>
        {(r.status === 'active' || r.status === 'upcoming') && <AddMetricButton onClick={() => onTeam(link.id)} />}
      </header>
      <p className="mt-0.5 text-[13px] text-ink-3" data-testid="challenge-when">{when}{ch.kind === 'first_to' && ' · if nobody gets there, the higher total wins'}</p>
      {ch.stake && (
        <p className="mt-2 flex items-start gap-1.5 text-[14px]" data-testid="challenge-stake">
          <Gift size={16} aria-hidden className="mt-0.5 shrink-0 text-[#e0a03a]" />
          <span><span className="text-ink-2">Winner gets</span> <span className="font-medium break-words">{ch.stake}</span></span>
        </p>
      )}
      {r.status !== 'pending' && r.status !== 'upcoming' && (
        <div className="mt-3 flex flex-col gap-2.5">
          <Contender label="You" value={fmt(r.me)} pct={max > 0 ? r.me / max : 0} hue={myHue} leader={leader === 'me'} />
          <Contender label={partnerName} value={fmt(r.them, theirs)} pct={max > 0 ? r.them / max : 0} hue={theirHue} leader={leader === 'them'} />
        </div>
      )}
      {tauntKind && metric && (
        <Bubble
          kind={tauntKind}
          seed={`${ch.id}:${today}`}
          facts={tauntFacts(myName, partnerName, myC ?? metric, myC, theirC, r.me - r.them, today, (v) => fmt(v))}
          myHue={myHue}
          theirHue={theirHue}
        />
      )}
      <p className="mt-3 text-[14px] font-medium" data-testid="challenge-verdict">{verdict}</p>
      {metric && (r.status === 'active' || r.status === 'awaiting') && (
        <ChallengeLogs ch={ch} metric={metric} mine={myC} theirs={theirC} myHue={myHue} theirHue={theirHue} />
      )}

      {theirRequest ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={() => { answerChallenge(pair.id, ch.id, true); toast('Challenge accepted'); }}>Accept</Button>
          <Button onClick={() => answerChallenge(pair.id, ch.id, false)}>Decline</Button>
        </div>
      ) : r.status === 'finished' ? null : confirmCancel ? (
        <div className="mt-3 rounded-lg bg-s2 p-3 text-[14px] text-ink-2">
          Call off this challenge? Nobody wins it.
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="danger" onClick={() => cancelChallenge(pair.id, ch.id)}>Call it off</Button>
            <Button onClick={() => setConfirmCancel(false)}>Keep</Button>
          </div>
        </div>
      ) : (
        <button type="button" className="mt-2 text-[13px] text-ink-3 underline underline-offset-2" onClick={() => setConfirmCancel(true)}>
          {r.status === 'pending' ? 'Withdraw' : 'Call it off'}
        </button>
      )}
    </article>
  );
}

const SRC_LABEL: Record<SharedLog['src'], string> = { t: 'timer', m: 'added', q: 'quick add' };

/**
 * Both sides' logs for one day of a challenge, with a day picker over the
 * challenge so far. Mine come from my live data; theirs from what their app
 * last published.
 */
function ChallengeLogs({ ch, metric, mine, theirs, myHue, theirHue }: {
  ch: Challenge; metric: Metric; mine: SharedMetric | undefined; theirs: SharedMetric | undefined; myHue: string; theirHue: string;
}) {
  const { today, dayOf } = useData();
  const { partnerName, theirScore } = useCompete();
  const span = challengeSpan(ch, dayOf);
  const last = span.end < today ? span.end : today;
  const [day, setDay] = useState(last);
  const shown = day > last ? last : day < span.start ? span.start : day;
  const label = shown === today ? 'Today' : shown === addDays(today, -1) ? 'Yesterday' : formatLocalDate(shown, 'EEE d MMM');
  // With times, only what's inside the window, and a timer only for its part inside.
  const counted = isTimed(ch) ? (l: SharedLog) => logInWindow(l, ch.startAt, ch.endAt) : (l: SharedLog) => l.v;
  const inside = (logs: SharedLog[] | undefined) => logs?.filter((l) => counted(l) > 0);
  const theirLogs = inside(theirs?.logs?.[shown]);

  let theirNote: string | null = null;
  if (!theirs?.logs) theirNote = `${partnerName}’s logs show up once they open the latest version of the app.`;
  else if (!theirLogs) theirNote = `Nothing from ${partnerName} for this day yet. Their numbers updated ${theirScore ? ago(theirScore.updatedAt) : 'a while ago'}.`;

  return (
    <section className="mt-4 border-t border-line pt-3" aria-label="Logs" data-testid="challenge-logs">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-medium text-ink-2">Logs</h4>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Previous day"
            disabled={shown <= span.start}
            onClick={() => setDay(addDays(shown, -1))}
            className="press grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-s2 disabled:opacity-30"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="min-w-24 text-center text-[13px] font-medium" data-testid="logs-day">{label}</span>
          <button
            type="button"
            aria-label="Next day"
            disabled={shown >= last}
            onClick={() => setDay(addDays(shown, 1))}
            className="press grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-s2 disabled:opacity-30"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>
      <LogList who="You" logs={inside(mine?.logs?.[shown]) ?? []} counted={counted} metric={metric} hue={myHue} />
      <LogList who={partnerName} logs={theirLogs ?? []} counted={counted} metric={theirs ?? metric} hue={theirHue} empty={theirNote} />
    </section>
  );
}

/** One side's logs for a day: time (a timer's span), how it was logged, amount, and the note. */
function LogList({ who, logs, counted, metric, hue, empty }: {
  who: string; logs: SharedLog[]; counted: (l: SharedLog) => number; metric: Pick<Metric, 'type' | 'unit'>; hue: string; empty?: string | null;
}) {
  const { tz } = useData();
  const total = logs.reduce((s, l) => s + counted(l), 0);
  return (
    <div className="mt-2" data-testid="log-list">
      <p className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <span aria-hidden className="size-2.5 shrink-0 self-center rounded-full" style={{ background: hue }} />
          <span className="truncate">{who}</span>
        </span>
        {!empty && (
          <span className="shrink-0 text-[13px] text-ink-2">
            {formatValue(metric, total)} · {logs.length === 1 ? '1 log' : `${logs.length} logs`}
          </span>
        )}
      </p>
      {empty || logs.length === 0 ? (
        <p className="mt-1 pl-[18px] text-[13px] text-ink-3">{empty ?? 'Nothing logged.'}</p>
      ) : (
        <ul className="mt-1 ml-[4px] flex flex-col">
          {logs.map((l, i) => (
            <li key={`${l.at}-${i}`} className="py-1.5 pl-3 text-[14px]" style={{ borderLeft: `2px solid color-mix(in srgb, ${hue} 45%, transparent)` }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-ink-2 tabular-nums">
                  {l.src === 't' && <Timer size={13} aria-hidden className="shrink-0 self-center" />}
                  {l.src === 't' ? `${formatTimeIn(l.at, tz)}–${formatTimeIn(new Date(Date.parse(l.at) + l.v * 1000).toISOString(), tz)}` : formatTimeIn(l.at, tz)}
                  <span className="text-[12px] text-ink-3">{SRC_LABEL[l.src]}{l.m && ` · ${l.m}`}</span>
                </span>
                <span className="shrink-0 font-medium">
                  +{formatValue(metric, counted(l))}
                  {counted(l) < l.v && <span className="ml-1 text-[12px] font-normal text-ink-3">of {formatValue(metric, l.v)}</span>}
                </span>
              </div>
              {l.note && <p className="mt-0.5 text-[13px] break-words text-ink">“{l.note}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Hours for durations ("20", "7.5"), whole units for counts. */
function parseAmount(type: Metric['type'], raw: string): number {
  const s = raw.trim().replace(',', '.');
  const n = Number(s);
  if (!s || !Number.isFinite(n) || n <= 0) return NaN;
  if (type === 'duration') return Math.round(n * 3600);
  return Number.isInteger(n) ? n : NaN;
}

const KINDS: { value: ChallengeKind; label: string; help: string }[] = [
  { value: 'first_to', label: 'First to', help: 'Whoever reaches the amount first wins. If nobody does by the end, the higher total wins.' },
  { value: 'most_total', label: 'Most', help: 'The higher total between the two dates wins.' },
  { value: 'most_days', label: 'Most days', help: 'More days hitting your own daily target wins. Rest days don’t count against you.' },
];

/** The next full hour, "HH:00", as the default start time. */
function nextHour(now: string, tz: string): string {
  const h = (Number(formatTimeIn(now, tz).slice(0, 2)) + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

const STAKE_MAX = 60;

function ChallengeForm({ onDone }: { onDone: () => void }) {
  const { uid, today, metricById, tz, dayOf } = useData();
  const { pair, links, sides, partnerName, now } = useCompete();
  const toast = useToast();
  const accepted = links.filter((l) => l.acceptedAt && l.startDate && metricById.has(l.metrics[uid]));
  const [linkId, setLinkId] = useState(accepted[0]?.id ?? '');
  const [kind, setKind] = useState<ChallengeKind>('first_to');
  const [amountText, setAmountText] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 6));
  const [withTimes, setWithTimes] = useState(false);
  const [startTime, setStartTime] = useState(() => nextHour(now, tz));
  const [endTime, setEndTime] = useState(() => nextHour(now, tz));
  const [stake, setStake] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!pair) return null;

  const link = accepted.find((l) => l.id === linkId);
  const metric = link ? metricById.get(link.metrics[uid]) : undefined;
  const s = link ? sides(link) : null;
  const myNow = s ? sideAt(s.mine, today) : undefined;
  const theirs = s ? sideAt(s.theirs, today) : undefined;
  // Target days need a target on both sides, on any of their metrics (theirs is only known once they've published).
  const noTargets = myNow?.target == null || (theirs !== undefined && theirs.target == null);
  // Target days are whole days, so times don't apply to them.
  const timed = withTimes && kind !== 'most_days';

  const save = () => {
    const errs: Record<string, string> = {};
    if (!link || !metric) errs.link = 'Choose a race.';
    const amount = kind === 'first_to' && metric ? parseAmount(metric.type, amountText) : null;
    if (kind === 'first_to' && !(amount && amount > 0)) errs.amount = metric?.type === 'count' ? `Enter a whole number of ${metric.unit}.` : 'Enter an amount in hours.';
    if (kind === 'most_days' && noTargets) errs.kind = 'Both sides need a daily target for this one.';
    const raceStart = link?.startDate ? `Pick ${formatLocalDate(link.startDate, 'd MMM')} or later, when this race started.` : '';
    let times: { startAt: string; endAt: string; startDate: string; endDate: string } | null = null;
    if (timed) {
      if (!startDate || !startTime) errs.start = 'Choose a start date and time.';
      if (!endDate || !endTime) errs.end = 'Choose an end date and time.';
      if (!errs.start && !errs.end) {
        const startAt = instantAt(startDate, startTime, tz).toISOString();
        const endAt = instantAt(endDate, endTime, tz).toISOString();
        times = { startAt, endAt, startDate: dayOf(startAt), endDate: dayOf(endAt) };
        if (link?.startDate && times.startDate < link.startDate) errs.start = raceStart;
        if (endAt <= startAt) errs.end = 'The end has to be after the start.';
        else if (endAt <= now) errs.end = 'The end has to be in the future.';
      }
    } else {
      if (!startDate) errs.start = 'Choose a start date.';
      else if (link?.startDate && startDate < link.startDate) errs.start = raceStart;
      if (!endDate) errs.end = 'Choose an end date.';
      else if (endDate < startDate) errs.end = 'The end can’t be before the start.';
      else if (endDate < today) errs.end = 'The end has to be today or later.';
    }
    setErrors(errs);
    if (Object.keys(errs).length || !link) return;
    proposeChallenge(pair.id, uid, {
      linkId: link.id,
      kind,
      amount,
      startDate: times?.startDate ?? startDate,
      endDate: times?.endDate ?? endDate,
      startAt: times?.startAt ?? null,
      endAt: times?.endAt ?? null,
      stake: stake.trim().slice(0, STAKE_MAX) || null,
    });
    toast(`Challenge sent to ${partnerName}`);
    onDone();
  };

  return (
    <form noValidate className="mt-2 flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {accepted.length > 1 && (
        <div>
          <Label htmlFor="ch-link">Race</Label>
          <select id="ch-link" className={inputClass} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            {accepted.map((l) => <option key={l.id} value={l.id}>{sideAt(sides(l).mine, today)?.name ?? metricById.get(l.metrics[uid])?.name}</option>)}
          </select>
          <FieldError>{errors.link}</FieldError>
        </div>
      )}
      <div>
        <Label>Kind</Label>
        <Segmented label="Kind" value={kind} onChange={setKind} options={KINDS.map(({ value, label }) => ({ value, label }))} />
        <p className="mt-1.5 text-[13px] text-ink-3">{KINDS.find((k) => k.value === kind)!.help}</p>
        <FieldError>{errors.kind}</FieldError>
      </div>
      {kind === 'first_to' && (
        <div>
          <Label htmlFor="ch-amount">Amount ({metric?.type === 'count' ? metric.unit : 'hours'})</Label>
          <input id="ch-amount" className={inputClass} inputMode="decimal" placeholder="20" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          <FieldError>{errors.amount}</FieldError>
        </div>
      )}
      <div>
        {kind !== 'most_days' && <Switch checked={withTimes} onChange={setWithTimes} label="Set start and end times" />}
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ch-start">From</Label>
            <input id="ch-start" type="date" className={inputClass} value={startDate} min={link?.startDate ?? undefined} onChange={(e) => setStartDate(e.target.value)} />
            {timed && <input id="ch-start-time" aria-label="Start time" type="time" className={cx(inputClass, 'mt-2')} value={startTime} onChange={(e) => setStartTime(e.target.value)} />}
            <FieldError>{errors.start}</FieldError>
          </div>
          <div>
            <Label htmlFor="ch-end">To</Label>
            <input id="ch-end" type="date" className={inputClass} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            {timed && <input id="ch-end-time" aria-label="End time" type="time" className={cx(inputClass, 'mt-2')} value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
            <FieldError>{errors.end}</FieldError>
          </div>
        </div>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {timed ? 'Only what’s logged between those times counts; a timer counts for the part inside.' : 'Both days count.'}{' '}
          {partnerName} has to accept before it’s on. Once it is, you both see each other’s logs for those days, notes included.
        </p>
      </div>
      <div>
        <Label htmlFor="ch-stake">Winner gets (optional)</Label>
        <input id="ch-stake" className={inputClass} maxLength={STAKE_MAX} placeholder="e.g. dinner on the loser" value={stake} onChange={(e) => setStake(e.target.value)} />
        <p className="mt-1.5 text-[13px] text-ink-3">Something at stake. {partnerName} sees it before accepting.</p>
      </div>
      <Button type="submit" variant="primary"><Trophy size={17} /> Send challenge</Button>
    </form>
  );
}
