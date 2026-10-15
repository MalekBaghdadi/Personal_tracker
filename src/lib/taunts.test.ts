import { describe, expect, it } from 'vitest';
import { SPEAKER, TAUNTS, taunt, type TauntKind } from './taunts';

const names = { me: 'Malek', them: 'Cousin' };
const kinds = Object.keys(TAUNTS) as TauntKind[];

describe('taunt', () => {
  it('holds still for the same seed and fills in the names', () => {
    const a = taunt('behind', 'link1:2026-10-11', names);
    expect(taunt('behind', 'link1:2026-10-11', names)).toEqual(a);
    expect(a.speaker).toBe('them');
    expect(a.line).not.toMatch(/\{/);
  });

  it('varies across days', () => {
    const facts = { ...names, metric: 'Network+', gap: '2h' };
    const lines = new Set(Array.from({ length: 30 }, (_, i) => taunt('ahead', `link1:day${i}`, facts).line));
    expect(lines.size).toBeGreaterThan(3);
  });

  it('never leaves a placeholder, whatever is known', () => {
    for (const k of kinds) {
      for (let i = 0; i < 40; i++) {
        expect(taunt(k, `s${i}`, names).line).not.toMatch(/[{}]/);
        expect(taunt(k, `s${i}`, { ...names, metric: 'Gym', gap: '3h', today: { me: 60, them: 0, fmt: (v) => `${v}s` }, logs: { me: 2, them: 5 } }).line).not.toMatch(/[{}]/);
      }
    }
  });

  it('every kind has a line that needs only the names', () => {
    for (const k of kinds) expect(TAUNTS[k].some((l) => !/\{(?!me\}|them\})/.test(l))).toBe(true);
  });

  it('winners talk to losers; ties go to the ref', () => {
    expect(SPEAKER.ahead).toBe('me');
    expect(SPEAKER.behind).toBe('them');
    expect(SPEAKER.lostWeek).toBe('them');
    expect(SPEAKER.level).toBe('ref');
    // Lines spoken to me use my name, never theirs as the addressee.
    for (const k of kinds.filter((k) => SPEAKER[k] === 'them')) for (const l of TAUNTS[k]) expect(l).not.toContain('{them}');
    for (const k of kinds.filter((k) => SPEAKER[k] === 'me')) for (const l of TAUNTS[k]) expect(l).not.toContain('{me}');
  });

  it('brags about today only when the speaker is ahead today', () => {
    const fmt = (v: number) => `${v}m`;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      // I lead the week but they did more today: no "today" brag from me.
      seen.add(taunt('ahead', `x${i}`, { ...names, today: { me: 10, them: 50, fmt }, logs: { me: 1, them: 4 } }).line);
    }
    expect([...seen].some((l) => l.includes('today'))).toBe(false);
    const brags = new Set<string>();
    for (let i = 0; i < 200; i++) brags.add(taunt('ahead', `x${i}`, { ...names, today: { me: 50, them: 0, fmt }, logs: { me: 3, them: 0 } }).line);
    expect(brags).toContain('50m today, Cousin. You did nothing. Keep up.');
    expect(brags).toContain('3 logs today, Cousin. You? nothing.');
  });

  it('every line fits a bubble and is swear-free', () => {
    for (const lines of Object.values(TAUNTS)) {
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(80);
        expect(l).not.toMatch(/\b(damn|hell|shit|fuck|crap|ass)\b/i);
      }
    }
  });
});
