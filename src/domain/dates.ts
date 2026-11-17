import type { LocalDate, TimeOfDay, Weekday } from './types';

/**
 * Calendar arithmetic on "YYYY-MM-DD" strings.
 * Internally uses UTC midnight so DST transitions can never shift a day.
 */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUtc(d: LocalDate): Date {
  if (!isLocalDate(d)) throw new Error(`Invalid date: ${d}`);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUtc(d: Date): LocalDate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar date of an instant, in the device's local time zone. */
export function toLocalDate(instant: Date = new Date()): LocalDate {
  const y = instant.getFullYear();
  const m = String(instant.getMonth() + 1).padStart(2, '0');
  const d = String(instant.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const u = toUtc(d);
  u.setUTCDate(u.getUTCDate() + n);
  return fromUtc(u);
}

/** Days from a to b (b - a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function isoWeekday(d: LocalDate): Weekday {
  const w = toUtc(d).getUTCDay(); // 0 = Sun
  return (w === 0 ? 7 : w) as Weekday;
}

/** Monday of the ISO week containing d. */
export function startOfIsoWeek(d: LocalDate): LocalDate {
  return addDays(d, 1 - isoWeekday(d));
}

export function startOfMonth(d: LocalDate): LocalDate {
  return d.slice(0, 8) + '01';
}

/** Inclusive range of dates. Empty if end < start. */
export function eachDay(start: LocalDate, end: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function isTimeOfDay(s: unknown): s is TimeOfDay {
  return typeof s === 'string' && TIME_RE.test(s);
}

export function parseTime(t: TimeOfDay): { hour: number; minute: number } {
  if (!isTimeOfDay(t)) throw new Error(`Invalid time: ${t}`);
  const [hour, minute] = t.split(':').map(Number);
  return { hour, minute };
}

/** Accepts "7", "730", "7:30", "07.30" and normalises to "07:30"; null if invalid. */
export function normalizeTime(input: string): TimeOfDay | null {
  const s = input.trim().replace('.', ':');
  if (!s) return null;
  let h: number, m: number;
  if (s.includes(':')) {
    const [a, b] = s.split(':');
    if (!/^\d{1,2}$/.test(a) || !/^\d{2}$/.test(b)) return null;
    h = +a; m = +b;
  } else if (/^\d{1,2}$/.test(s)) {
    h = +s; m = 0;
  } else if (/^\d{3,4}$/.test(s)) {
    h = +s.slice(0, -2); m = +s.slice(-2);
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
