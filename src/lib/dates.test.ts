import { describe, expect, it } from 'vitest';
import { addMinutes, clock12, dayOf, instantOnDay, minutesBetween, todayIn, whenText } from './dates';

// Beirut is UTC+3 in October.
const TZ = 'Asia/Beirut';
const at = (local: string) => new Date(`${local}+03:00`);

describe('dayOf with a 5am rollover', () => {
  it('after midnight but before 5am is still the previous day', () => {
    expect(dayOf(at('2026-10-07T01:30:00'), TZ, 5)).toBe('2026-10-06');
    expect(dayOf(at('2026-10-07T04:59:59'), TZ, 5)).toBe('2026-10-06');
  });
  it('from 5am it is the new day', () => {
    expect(dayOf(at('2026-10-07T05:00:00'), TZ, 5)).toBe('2026-10-07');
    expect(dayOf(at('2026-10-07T23:59:00'), TZ, 5)).toBe('2026-10-07');
  });
  it('midnight rollover is the plain local date', () => {
    expect(dayOf(at('2026-10-07T00:10:00'), TZ, 0)).toBe('2026-10-07');
  });
  it('accepts ISO strings and works across months', () => {
    expect(dayOf(at('2026-11-01T02:00:00').toISOString(), TZ, 5)).toBe('2026-10-31');
  });
  it('todayIn uses the same rule', () => {
    expect(todayIn(TZ, 5, at('2026-10-07T03:00:00'))).toBe('2026-10-06');
    expect(todayIn(TZ, 0, at('2026-10-07T03:00:00'))).toBe('2026-10-07');
  });
});

describe('clock12: the two 12s say which one they are', () => {
  it('names noon and midnight', () => {
    expect(clock12('12:00')).toBe('12:00 PM (noon)');
    expect(clock12('00:00')).toBe('12:00 AM (midnight)');
  });
  it('other 12 o’clock minutes are plain AM/PM', () => {
    expect(clock12('00:30')).toBe('12:30 AM');
    expect(clock12('12:30')).toBe('12:30 PM');
  });
  it('ordinary hours', () => {
    expect(clock12('06:05')).toBe('6:05 AM');
    expect(clock12('18:45')).toBe('6:45 PM');
    expect(clock12('23:59')).toBe('11:59 PM');
  });
});

describe('whenText', () => {
  it('a date and a clock time', () => {
    expect(whenText('2026-11-04', '12:00')).toBe('Wed 4 Nov, 12:00 PM (noon)');
    expect(whenText('2026-11-04', '18:30', 'Tomorrow')).toBe('Tomorrow 6:30 PM');
  });
  it('midnight names the two days it sits between, whatever label is passed', () => {
    expect(whenText('2026-11-04', '00:00')).toBe('midnight, Tue 3 → Wed 4 Nov');
    expect(whenText('2026-11-04', '00:00', 'Tomorrow')).toBe('midnight, Tue 3 → Wed 4 Nov');
    expect(whenText('2026-11-01', '00:00')).toBe('midnight, Sat 31 → Sun 1 Nov');
  });
});

describe('start and end times of a log', () => {
  it('a time before the rollover belongs to the next calendar day', () => {
    expect(instantOnDay('2026-10-06', '01:30', TZ, 5).toISOString()).toBe(at('2026-10-07T01:30:00').toISOString());
    expect(instantOnDay('2026-10-06', '05:00', TZ, 5).toISOString()).toBe(at('2026-10-06T05:00:00').toISOString());
    expect(instantOnDay('2026-10-06', '01:30', TZ, 0).toISOString()).toBe(at('2026-10-06T01:30:00').toISOString());
  });
  it('minutesBetween goes forward past midnight', () => {
    expect(minutesBetween('09:00', '10:30')).toBe(90);
    expect(minutesBetween('23:30', '00:10')).toBe(40);
    expect(minutesBetween('09:00', '09:00')).toBe(0);
  });
  it('addMinutes wraps past midnight', () => {
    expect(addMinutes('23:30', 45)).toBe('00:15');
    expect(addMinutes('09:00', 0)).toBe('09:00');
    expect(addMinutes('00:10', -20)).toBe('23:50');
  });
});
