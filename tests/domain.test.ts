import { describe, expect, it } from 'vitest';
import {
  dateKey,
  duration,
  initialSettings,
  validateFix,
  csv,
  fromIstInput,
  istInput,
  type Day,
} from '../src/domain';

const day: Day = {
  id: '1',
  staff_id: '1',
  work_date: '2026-11-20',
  check_in: '2026-11-20T03:30:00Z',
  check_out: '2026-11-20T12:30:31Z',
  breaks: [],
  break_started_at: null,
  break_override_minutes: null,
  break_mode: 'fixed',
  fixed_break_minutes: 60,
  break_after_minutes: 360,
  source: 'gps',
  version: 1,
};
describe('working time and lunch', () => {
  it('adds subsequent recorded breaks to an admin-reviewed running shift', () => {
    const reviewed = {
      ...day,
      break_override_minutes: 30,
      breaks: [{ start: '2026-11-20T10:00:00Z', end: '2026-11-20T10:15:00Z' }],
    };
    expect(duration(reviewed).unpaid).toBe(2700);
  });
  it('keeps seconds and deducts the agreed allowance once', () => {
    expect(duration(day).worked).toBe(28831);
  });
  it('deducts a longer recorded break without adding the allowance twice', () => {
    expect(
      duration({ ...day, breaks: [{ start: '2026-11-20T07:30:00Z', end: '2026-11-20T09:30:00Z' }] })
        .worked,
    ).toBe(25231);
  });
  it('leaves undecided lunch unconfirmed and allows an explicit zero override', () => {
    expect(duration({ ...day, break_mode: 'pending' })).toMatchObject({
      reviewed: false,
      worked: 0,
    });
    expect(duration({ ...day, break_mode: 'pending', break_override_minutes: 0 }).worked).toBe(
      32431,
    );
  });
  it('tracks actual breaks and supports overnight shifts', () => {
    const h = duration({
      ...day,
      check_in: '2026-11-20T16:30:00Z',
      check_out: '2026-11-21T00:30:00Z',
      break_mode: 'tracked',
      breaks: [{ start: '2026-11-20T18:30:00Z', end: '2026-11-20T19:00:00Z' }],
    });
    expect(h.worked).toBe(27000);
  });
  it('does not apply a fixed lunch to short shifts', () =>
    expect(duration({ ...day, check_out: '2026-11-20T07:30:00Z' }).unpaid).toBe(0));
});
describe('location and data formatting', () => {
  const now = Date.now(),
    fix = {
      latitude: initialSettings.latitude!,
      longitude: initialSettings.longitude!,
      accuracy: 5,
      captured_at: new Date(now).toISOString(),
    };
  it('accepts a fresh precise fix at the PB shop', () =>
    expect(validateFix(fix, initialSettings, now)).toBe(0));
  it('rejects a fix outside 25m, poor accuracy, stale readings and non-finite coordinates', () => {
    expect(() =>
      validateFix({ ...fix, latitude: fix.latitude + 0.001 }, initialSettings, now),
    ).toThrow('closer');
    expect(() => validateFix({ ...fix, accuracy: 60 }, initialSettings, now)).toThrow('accuracy');
    expect(() => validateFix(fix, initialSettings, now + 61000)).toThrow('expired');
    expect(() => validateFix({ ...fix, latitude: NaN }, initialSettings, now)).toThrow('Invalid');
  });
  it('uses IST even across a UTC date boundary', () => {
    expect(dateKey(new Date('2026-11-20T20:00:00Z'))).toBe('2026-11-21');
    expect(fromIstInput('2026-11-21T01:30')).toBe('2026-11-20T20:00:00.000Z');
    expect(fromIstInput(istInput('2026-11-20T20:00:31Z'))).toBe('2026-11-20T20:00:31.000Z');
  });
  it('escapes CSV quotes and spreadsheet formulas', () => {
    const out = csv([['=1+1', 'a"b', 'x,y']]);
    expect(out).toContain('"\'=1+1"');
    expect(out).toContain('"a""b"');
    expect(out).toContain('"x,y"');
  });
});
