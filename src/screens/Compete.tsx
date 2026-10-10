import { useState } from 'react';
import { Copy, Crown, Frown, Share2, Trophy } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useData } from '../state/DataContext';
import { useCompete } from '../state/CompeteContext';
import { useHue } from '../state/theme';
import { addDays, formatLocalDate } from '../lib/dates';
import { weekOf } from '../lib/streaks';
import { formatValue } from '../lib/format';
import { iconFor } from '../lib/icons';
import { canLink, challengeResult, nameFromEmail, normalizeCode, race, type Challenge, type Outcome, type ChallengeKind, type ChallengeResult, type Link, type SharedMetric, type Side } from '../lib/compete';
import {
  acceptLink, answerChallenge, cancelChallenge, cancelInvite, createInvite, endLink, endPair, joinWithCode, proposeChallenge, proposeLink, renameInPair,
  type JoinError,
} from '../lib/competeRepo';
import { Button, FieldError, Label, Segmented, Sheet, cx, inputClass, useBump, useToast } from '../components/ui';
import { Confetti } from '../components/Confetti';
import { taunt, type TauntKind } from '../lib/taunts';
import { local } from '../lib/device';
import { fmtDay } from '../components/Goals';
import type { Metric } from '../lib/types';

/** Two linked accounts race on linked metrics, week by week, plus challenges either can start. */
export function Compete() {
  const { ready, pair, partnerName } = useCompete();
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-28 md:pb-10">
      <h1 className="mb-4 text-[22px] font-semibold tracking-tight">
        Compete{pair && <span className="font-normal text-ink-3"> · you vs {partnerName}</span>}
      </h1>
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
        each hit your target, and challenges either of you can start. They only ever see totals for the metrics you link, never your notes
        or anything else.
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

function Paired() {
  const { uid, metricById } = useData();
  const { pair, partnerUid, partnerName, links, challenges, theirScore } = useCompete();
  const [linkSheet, setLinkSheet] = useState(false);
  const [challengeSheet, setChallengeSheet] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  if (!pair || !partnerUid) return null;

  const accepted = links.filter((l) => l.acceptedAt && metricById.has(l.metrics[uid]));
  const theirProposals = links.filter((l) => !l.acceptedAt && l.proposedBy !== uid);
  const myProposals = links.filter((l) => !l.acceptedAt && l.proposedBy === uid);
  const challengeRequests = challenges.filter((c) => !c.acceptedAt && !c.declinedAt && !c.cancelledAt && c.createdBy !== uid);

  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-2 text-[13px] text-ink-3" data-testid="freshness">
        {theirScore ? `${partnerName}’s numbers updated ${ago(theirScore.updatedAt)}.` : `${partnerName} hasn’t shared any numbers yet.`} Theirs update
        whenever they open the app.
      </p>

      <Results />

      {(theirProposals.length > 0 || challengeRequests.length > 0) && (
        <section aria-label="Requests" className="flex flex-col gap-3">
          {theirProposals.map((l) => <LinkRequest key={l.id} link={l} />)}
          {challengeRequests.map((c) => <ChallengeCard key={c.id} ch={c} />)}
        </section>
      )}

      <section aria-labelledby="races-h" data-tour="compete-race">
        <h2 id="races-h" className="mb-2 text-[15px] font-medium">Weekly race</h2>
        {accepted.length === 0 && myProposals.length === 0 && (
          <p className="mb-3 text-[14px] text-ink-2">Link one of your metrics to one of {partnerName}’s to start racing, like your Studying against theirs.</p>
        )}
        <div className="flex flex-col gap-3">
          {accepted.map((l) => <RaceCard key={l.id} link={l} />)}
          {myProposals.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-[14px]">
              <span className="text-ink-2">Waiting for {partnerName} to pick a metric to race your {metricById.get(l.metrics[uid])?.name ?? 'metric'}.</span>
              <Button variant="ghost" className="shrink-0 px-3" onClick={() => endLink(pair.id, l.id)}>Withdraw</Button>
            </div>
          ))}
        </div>
        <Button className="mt-3 w-full" onClick={() => setLinkSheet(true)}>Link a metric</Button>
      </section>

      <Challenges onNew={() => setChallengeSheet(true)} canCreate={accepted.length > 0} />

      <section className="flex flex-col gap-3 border-t border-line pt-5">
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

      <Sheet open={linkSheet} onClose={() => setLinkSheet(false)} title="Link a metric">
        {linkSheet && <LinkForm onDone={() => setLinkSheet(false)} />}
      </Sheet>
      <Sheet open={challengeSheet} onClose={() => setChallengeSheet(false)} title="New challenge">
        {challengeSheet && <ChallengeForm onDone={() => setChallengeSheet(false)} />}
      </Sheet>
    </div>
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

/** My metrics that can go into a new link: the right kind, and not already linked or proposed. */
function useFreeMetrics(): Metric[] {
  const { uid, metrics } = useData();
  const { links } = useCompete();
  const used = new Set(links.map((l) => l.metrics[uid]).filter(Boolean));
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
        {partnerName} then picks one of theirs to race it against. It has to be a {metric ? typeWord(metric.type) : ''} metric too. Only its daily totals and
        target days are shared.
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

function RaceCard({ link }: { link: Link }) {
  const { uid, today, metricById } = useData();
  const { pair, partnerUid, partnerName, theirScore, mine } = useCompete();
  const [confirmStop, setConfirmStop] = useState(false);
  const metric = metricById.get(link.metrics[uid]);
  const theirId = partnerUid ? link.metrics[partnerUid] : undefined;
  const theirs = theirId ? theirScore?.metrics[theirId] : undefined;
  const myHue = useHue(metric?.color ?? '#8590a3');
  const theirHue = useHue(theirs?.color ?? '#8590a3');
  const current = pair && metric && link.startDate
    ? race(mine[metric.id], theirs, link.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn).current
    : null;
  // Pops the verdict when the lead changes hands.
  const verdictBump = useBump(!current || current.me.total === current.them.total ? 'level' : current.me.total > current.them.total ? 'me' : 'them');
  if (!pair || !metric || !link.startDate) return null;
  const Icon = iconFor(metric.icon);
  const r = race(mine[metric.id], theirs, link.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn);
  const { me, them } = r.current;
  const gap = me.total - them.total;
  const top = Math.max(me.total, them.total);
  const last = r.past[0];

  return (
    <article className="rounded-xl border border-line bg-s1 p-4" data-testid="race-card">
      <header className="flex items-center gap-2">
        <Icon size={17} style={{ color: myHue }} aria-hidden className="shrink-0" />
        <h3 className="truncate text-[15px] font-medium">
          {metric.name}
          {theirs && theirs.name !== metric.name && <span className="font-normal text-ink-3"> vs {theirs.name}</span>}
        </h3>
      </header>
      <p className="mt-0.5 text-[13px] text-ink-3">
        This week · {formatLocalDate(r.current.start, 'd MMM')} – {formatLocalDate(r.current.end, 'd MMM')}
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        <Contender label="You" value={formatValue(metric, me.total)} suffix={targetDays(me)} pct={top ? me.total / top : 0} hue={myHue} leader={gap > 0} />
        <Contender label={partnerName} value={formatValue(theirs ?? metric, them.total)} suffix={targetDays(them)} pct={top ? them.total / top : 0} hue={theirHue} leader={gap < 0} />
      </div>

      <p key={verdictBump} className={cx('mt-3 text-[14px] font-medium', verdictBump > 0 && 'bump')} data-testid="race-verdict">
        {gap === 0 ? (me.total === 0 ? 'Nothing logged yet this week' : 'Level') : gap > 0 ? `You’re ${formatValue(metric, gap)} ahead` : `${partnerName} is ${formatValue(metric, -gap)} ahead`}
      </p>
      <Taunt kind={raceTaunt(me.total, them.total)} seed={`${link.id}:${today}`} them={partnerName} />
      <p className="mt-1 text-[13px] text-ink-2" data-testid="race-tally">
        Weeks won: you {r.wins} · {partnerName} {r.losses}
        {r.draws > 0 && ` · ${r.draws} ${r.draws === 1 ? 'draw' : 'draws'}`}
      </p>
      {last && (
        <p className="mt-0.5 text-[13px] text-ink-3">
          Last week:{' '}
          {last.outcome === null
            ? `waiting for ${partnerName}’s numbers`
            : `${last.outcome === 'me' ? 'you won' : last.outcome === 'them' ? `${partnerName} won` : 'a draw'}, ${formatValue(metric, last.me.total)} to ${formatValue(theirs ?? metric, last.them.total)}`}
        </p>
      )}

      {confirmStop ? (
        <div className="mt-3 rounded-lg bg-s2 p-3 text-[14px] text-ink-2">
          Stop racing on {metric.name}? The weeks won so far go with it.
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

function Taunt({ kind, seed, them }: { kind: TauntKind; seed: string; them: string }) {
  const line = taunt(kind, seed, them);
  return (
    <p key={line} className="taunt-in mt-0.5 text-[13px] text-ink-2 italic" data-testid="taunt">
      {line}
    </p>
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
  const { uid, today, metricById } = useData();
  const { pair, links, challenges, mine, theirScore, partnerUid, partnerName } = useCompete();
  const [seen, setSeen] = useState(readSeen);
  if (!pair) return null;

  const results: Result[] = [];
  for (const l of links) {
    const metric = metricById.get(l.metrics[uid]);
    if (!l.acceptedAt || !l.startDate || !metric) continue;
    const theirs = partnerUid ? theirScore?.metrics[l.metrics[partnerUid]] : undefined;
    const last = race(mine[metric.id], theirs, l.startDate, today, theirScore?.asOf ?? null, pair.weekStartsOn).past[0];
    if (!last?.outcome) continue;
    results.push({
      id: `week:${l.id}:${last.start}`,
      outcome: last.outcome,
      title: last.outcome === 'me' ? `You won the week on ${metric.name}` : last.outcome === 'them' ? `${partnerName} took the week on ${metric.name}` : `The week on ${metric.name} was a draw`,
      score: `${formatValue(metric, last.me.total)} to ${formatValue(theirs ?? metric, last.them.total)}`,
      kind: last.outcome === 'me' ? 'wonWeek' : last.outcome === 'them' ? 'lostWeek' : 'drewWeek',
    });
  }
  const recent = addDays(today, -14);
  for (const c of challenges) {
    const link = links.find((l) => l.id === c.linkId);
    if (!link) continue;
    const r = resultFor(c, links, uid, partnerUid, mine, theirScore, today);
    const decided = (c.kind === 'first_to' ? [r.reached.me, r.reached.them].filter((d): d is string => !!d).sort()[0] : undefined) ?? c.endDate;
    if (r.status !== 'finished' || !r.winner || decided < recent) continue;
    const m = mine[link.metrics[uid]];
    const fmt = (v: number) => (c.kind === 'most_days' ? `${v} ${v === 1 ? 'day' : 'days'}` : m ? formatValue(m, v) : String(v));
    const title = challengeTitle(c, links, uid, mine);
    results.push({
      id: `ch:${c.id}`,
      outcome: r.winner,
      title: r.winner === 'me' ? `You won “${title}”` : r.winner === 'them' ? `${partnerName} won “${title}”` : `“${title}” ended in a draw`,
      score: `${fmt(r.me)} to ${fmt(r.them)}`,
      kind: r.winner === 'me' ? 'wonChallenge' : r.winner === 'them' ? 'lostChallenge' : 'drewChallenge',
    });
  }

  const next = results.find((r) => !seen.includes(r.id));
  if (!next) return null;
  const dismiss = () => {
    const all = [...seen, next.id].slice(-200);
    local.set(SEEN_KEY, JSON.stringify(all));
    setSeen(all);
  };
  return <ResultBanner key={next.id} result={next} them={partnerName} onDismiss={dismiss} />;
}

function ResultBanner({ result, them, onDismiss }: { result: Result; them: string; onDismiss: () => void }) {
  const [confetti, setConfetti] = useState(result.outcome === 'me');
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
      <p className="taunt-in mt-1 text-[14px] text-ink-2 italic">{taunt(result.kind, result.id, them)}</p>
      <Button className="mt-3 min-w-28" variant={won ? 'primary' : 'quiet'} onClick={onDismiss}>
        {won ? 'Gloat' : lost ? 'Ugh, fine' : 'OK'}
      </Button>
    </section>
  );
}

// ── Challenges ─────────────────────────────────────────────────────────────

const LIVE: ChallengeResult['status'][] = ['active', 'upcoming', 'awaiting', 'pending'];

function Challenges({ onNew, canCreate }: { onNew: () => void; canCreate: boolean }) {
  const { uid, today } = useData();
  const { challenges, links, mine, theirScore, partnerUid, partnerName } = useCompete();
  const [showAll, setShowAll] = useState(false);
  const withResult = challenges
    .filter((c) => links.some((l) => l.id === c.linkId))
    .map((c) => ({ c, r: resultFor(c, links, uid, partnerUid, mine, theirScore, today) }));
  // Their open requests are shown at the top of the page instead.
  const live = withResult.filter(({ c, r }) => LIVE.includes(r.status) && !(r.status === 'pending' && c.createdBy !== uid));
  const done = withResult.filter(({ r }) => r.status === 'finished').reverse();

  return (
    <section aria-labelledby="ch-h" data-tour="compete-challenges">
      <h2 id="ch-h" className="mb-2 text-[15px] font-medium">Challenges</h2>
      {live.length === 0 && (
        <p className="mb-3 text-[14px] text-ink-2">
          {canCreate ? `Start one: first to 20 hours, most this month, or most days hitting your target. ${partnerName} accepts it first.` : 'Link a metric first, then challenge each other on it.'}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {live.map(({ c }) => <ChallengeCard key={c.id} ch={c} />)}
      </div>
      <Button className="mt-3 w-full" disabled={!canCreate} onClick={onNew}>New challenge</Button>
      {done.length > 0 && (
        <>
          <h3 className="mt-5 mb-1 text-[13px] font-medium text-ink-3">Finished</h3>
          <ul className="divide-y divide-line border-y border-line" data-testid="finished-challenges">
            {(showAll ? done : done.slice(0, 5)).map(({ c, r }) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 truncate">{challengeTitle(c, links, uid, mine)}</span>
                <span className={cx('shrink-0', r.winner === 'me' ? 'font-medium' : 'text-ink-2')}>
                  {r.winner === 'me' ? 'You won' : r.winner === 'them' ? `${partnerName} won` : 'Draw'}
                </span>
              </li>
            ))}
          </ul>
          {done.length > 5 && !showAll && (
            <button type="button" className="mt-2 text-[13px] text-ink-2 underline underline-offset-2" onClick={() => setShowAll(true)}>Show all</button>
          )}
        </>
      )}
    </section>
  );
}

function resultFor(
  c: Challenge,
  links: Link[],
  uid: string,
  partnerUid: string | null,
  mine: Record<string, SharedMetric>,
  theirScore: ReturnType<typeof useCompete>['theirScore'],
  today: string,
): ChallengeResult {
  const link = links.find((l) => l.id === c.linkId);
  const myId = link?.metrics[uid];
  const theirId = link && partnerUid ? link.metrics[partnerUid] : undefined;
  return challengeResult(c, myId ? mine[myId] : undefined, theirId ? theirScore?.metrics[theirId] : undefined, today, theirScore?.asOf ?? null);
}

function challengeTitle(c: Challenge, links: Link[], uid: string, mine: Record<string, SharedMetric>): string {
  const link = links.find((l) => l.id === c.linkId);
  const m = link ? mine[link.metrics[uid]] : undefined;
  const name = m?.name ?? 'metric';
  if (c.kind === 'first_to') return `First to ${m && c.amount ? formatValue(m, c.amount) : '…'} of ${name}`;
  if (c.kind === 'most_total') return `Most ${name}`;
  return `Most ${name} target days`;
}

function ChallengeCard({ ch }: { ch: Challenge }) {
  const { uid, today, metricById } = useData();
  const { pair, links, mine, theirScore, partnerUid, partnerName } = useCompete();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const link = links.find((l) => l.id === ch.linkId);
  const metric = link ? metricById.get(link.metrics[uid]) : undefined;
  const theirs = link && partnerUid ? theirScore?.metrics[link.metrics[partnerUid]] : undefined;
  const myHue = useHue(metric?.color ?? '#8590a3');
  const theirHue = useHue(theirs?.color ?? '#8590a3');
  if (!pair || !link) return null;
  const r = resultFor(ch, links, uid, partnerUid, mine, theirScore, today);
  const fmt = (v: number, m?: Pick<Metric, 'type' | 'unit'>) => (ch.kind === 'most_days' ? `${v} ${v === 1 ? 'day' : 'days'}` : formatValue(m ?? metric ?? { type: link.type, unit: '' }, v));
  const max = ch.kind === 'first_to' && ch.amount ? ch.amount : Math.max(r.me, r.them);
  const theirRequest = r.status === 'pending' && ch.createdBy !== uid;

  const when =
    r.status === 'upcoming' ? `Starts ${fmtDay(ch.startDate, today)}`
    : r.status === 'active' || r.status === 'pending'
      ? ch.endDate === today ? 'Ends today' : `${fmtDay(ch.startDate, today)} – ${fmtDay(ch.endDate, today)}`
      : `Ended ${fmtDay(ch.endDate, today)}`;

  let verdict: string;
  if (r.status === 'pending') verdict = theirRequest ? `${partnerName} challenges you` : `Waiting for ${partnerName} to accept`;
  else if (r.status === 'upcoming') verdict = 'Not started yet';
  else if (r.status === 'awaiting') verdict = `Waiting for ${partnerName}’s numbers to settle it`;
  else if (r.status === 'finished') verdict = r.winner === 'me' ? 'You won' : r.winner === 'them' ? `${partnerName} won` : 'A draw';
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
      <h3 className="text-[15px] font-medium">{challengeTitle(ch, links, uid, mine)}</h3>
      <p className="mt-0.5 text-[13px] text-ink-3">{when}{ch.kind === 'first_to' && ' · if nobody gets there, the higher total wins'}</p>
      {r.status !== 'pending' && r.status !== 'upcoming' && (
        <div className="mt-3 flex flex-col gap-2.5">
          <Contender label="You" value={fmt(r.me)} pct={max > 0 ? r.me / max : 0} hue={myHue} leader={leader === 'me'} />
          <Contender label={partnerName} value={fmt(r.them, theirs)} pct={max > 0 ? r.them / max : 0} hue={theirHue} leader={leader === 'them'} />
        </div>
      )}
      <p className="mt-3 text-[14px] font-medium" data-testid="challenge-verdict">{verdict}</p>
      {tauntKind && <Taunt kind={tauntKind} seed={`${ch.id}:${today}`} them={partnerName} />}

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

function ChallengeForm({ onDone }: { onDone: () => void }) {
  const { uid, today, metricById } = useData();
  const { pair, links, partnerUid, partnerName, theirScore } = useCompete();
  const toast = useToast();
  const accepted = links.filter((l) => l.acceptedAt && l.startDate && metricById.has(l.metrics[uid]));
  const [linkId, setLinkId] = useState(accepted[0]?.id ?? '');
  const [kind, setKind] = useState<ChallengeKind>('first_to');
  const [amountText, setAmountText] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 6));
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!pair) return null;

  const link = accepted.find((l) => l.id === linkId);
  const metric = link ? metricById.get(link.metrics[uid]) : undefined;
  const theirs = link && partnerUid ? theirScore?.metrics[link.metrics[partnerUid]] : undefined;
  // Target days need a target on both sides (theirs is only known once they've published).
  const noTargets = metric?.target == null || (theirs !== undefined && theirs.target == null);

  const save = () => {
    const errs: Record<string, string> = {};
    if (!link || !metric) errs.link = 'Choose a race.';
    const amount = kind === 'first_to' && metric ? parseAmount(metric.type, amountText) : null;
    if (kind === 'first_to' && !(amount && amount > 0)) errs.amount = metric?.type === 'count' ? `Enter a whole number of ${metric.unit}.` : 'Enter an amount in hours.';
    if (kind === 'most_days' && noTargets) errs.kind = 'Both metrics need a daily target for this one.';
    if (!startDate) errs.start = 'Choose a start date.';
    else if (link?.startDate && startDate < link.startDate) errs.start = `Pick ${formatLocalDate(link.startDate, 'd MMM')} or later, when this race started.`;
    if (!endDate) errs.end = 'Choose an end date.';
    else if (endDate < startDate) errs.end = 'The end can’t be before the start.';
    else if (endDate < today) errs.end = 'The end has to be today or later.';
    setErrors(errs);
    if (Object.keys(errs).length || !link) return;
    proposeChallenge(pair.id, uid, { linkId: link.id, kind, amount, startDate, endDate });
    toast(`Challenge sent to ${partnerName}`);
    onDone();
  };

  return (
    <form noValidate className="mt-2 flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      {accepted.length > 1 && (
        <div>
          <Label htmlFor="ch-link">Race</Label>
          <select id="ch-link" className={inputClass} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            {accepted.map((l) => <option key={l.id} value={l.id}>{metricById.get(l.metrics[uid])?.name}</option>)}
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ch-start">From</Label>
          <input id="ch-start" type="date" className={inputClass} value={startDate} min={link?.startDate ?? undefined} onChange={(e) => setStartDate(e.target.value)} />
          <FieldError>{errors.start}</FieldError>
        </div>
        <div>
          <Label htmlFor="ch-end">To</Label>
          <input id="ch-end" type="date" className={inputClass} value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          <FieldError>{errors.end}</FieldError>
        </div>
      </div>
      <p className="-mt-3 text-[13px] text-ink-3">Both days count. {partnerName} has to accept before it’s on.</p>
      <Button type="submit" variant="primary"><Trophy size={17} /> Send challenge</Button>
    </form>
  );
}
