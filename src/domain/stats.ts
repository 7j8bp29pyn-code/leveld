import { addDays, compareDates, eachDay, startOfIsoWeek } from './dates';
import { entryKey, indexEntries, isEligibleOn, isScheduledOn } from './schedule';
import { FULFILLED, type EntryStatus, type Habit, type HabitEntry, type LocalDate } from './types';

/**
 * Completion statistics, computed only from stored raw data.
 *
 * Rules (documented in docs/ARCHITECTURE.md):
 *  - done, adapted and recovery count as fulfilled (`done` = their sum, breakdown in adapted/recovery).
 *  - skipped, paused, postponed and health_pause are NOT failures → excluded from the rate.
 *  - a planned past day without any entry is "undocumented" (shown explicitly) and
 *    counts as not done in the rate.
 *  - today without an entry is "open" and excluded (the day isn't over).
 *  - days after `today` are ignored.
 *  - rate is null when nothing could be evaluated (missing ≠ 0 %).
 */
export interface HabitStats {
  planned: number;
  /** fulfilled = done + adapted + recovery */
  done: number;
  adapted: number;
  recovery: number;
  healthPause: number;
  skipped: number;
  paused: number;
  postponed: number;
  undocumented: number;
  open: number;
  /** done on days that were not planned (extra) – not part of the rate */
  extra: number;
  /** done / (done + undocumented); null if denominator is 0 */
  rate: number | null;
}

export const emptyStats = (): HabitStats => ({
  planned: 0, done: 0, adapted: 0, recovery: 0, healthPause: 0, skipped: 0, paused: 0, postponed: 0, undocumented: 0, open: 0, extra: 0, rate: null,
});

const isFulfilled = (st: EntryStatus | undefined) => !!st && FULFILLED.includes(st);

/** Adds one documented occurrence to the counters. */
function count(s: HabitStats, st: EntryStatus) {
  if (isFulfilled(st)) {
    s.done++;
    if (st === 'adapted') s.adapted++;
    if (st === 'recovery') s.recovery++;
  } else if (st === 'health_pause') s.healthPause++;
  else if (st === 'skipped' || st === 'paused' || st === 'postponed') s[st]++;
}

function finalize(s: HabitStats): HabitStats {
  const denom = s.done + s.undocumented;
  return { ...s, rate: denom > 0 ? s.done / denom : null };
}

export function habitStats(
  habit: Habit,
  entries: HabitEntry[],
  start: LocalDate,
  end: LocalDate,
  today: LocalDate,
): HabitStats {
  const s = emptyStats();
  const last = compareDates(end, today) > 0 ? today : end;
  if (compareDates(last, start) < 0) return s;
  const own = entries.filter((e) => e.habitId === habit.id);
  const idx = indexEntries(own);
  const postponedTargets = new Set(own.filter((e) => e.status === 'postponed' && e.postponedTo).map((e) => e.postponedTo!));

  if (habit.scheduleType === 'times_per_week') return finalize(weeklyStats(habit, idx, start, last, today));

  for (const d of eachDay(start, last)) {
    const entry = idx.get(entryKey(habit.id, d));
    const planned = isScheduledOn(habit, d) || (postponedTargets.has(d) && isEligibleOn(habit, d));
    if (!planned) {
      if (isFulfilled(entry?.status)) s.extra++;
      continue;
    }
    s.planned++;
    if (!entry) {
      if (d === today) s.open++;
      else s.undocumented++;
      continue;
    }
    count(s, entry.status);
  }
  return finalize(s);
}

/** For x-per-week habits: each ISO week contributes its (prorated) target. */
function weeklyStats(habit: Habit, idx: Map<string, HabitEntry>, start: LocalDate, last: LocalDate, today: LocalDate): HabitStats {
  const s = emptyStats();
  const target = habit.timesPerWeek ?? 1;
  let weekStart = startOfIsoWeek(start);
  while (compareDates(weekStart, last) <= 0) {
    const weekEnd = addDays(weekStart, 6);
    const days = eachDay(weekStart, weekEnd).filter((d) => compareDates(d, start) >= 0 && compareDates(d, last) <= 0);
    const eligible = days.filter((d) => isEligibleOn(habit, d));
    let done = 0;
    for (const d of days) {
      const e = idx.get(entryKey(habit.id, d));
      if (!e) continue;
      if (isFulfilled(e.status)) {
        done++;
        if (e.status === 'adapted') s.adapted++;
        if (e.status === 'recovery') s.recovery++;
      } else count(s, e.status);
    }
    // prorate target for partial weeks (range edges, start date, pauses)
    const weekTarget = Math.min(7, Math.round((target * eligible.length) / 7));
    const counted = Math.min(done, weekTarget);
    s.done += counted;
    s.extra += done - counted;
    s.planned += weekTarget;
    const missing = weekTarget - counted;
    const weekRunning = compareDates(weekEnd, today) >= 0;
    if (weekRunning) s.open += missing;
    else s.undocumented += missing;
    weekStart = addDays(weekStart, 7);
  }
  return s;
}

export function combineStats(list: HabitStats[]): HabitStats {
  const s = emptyStats();
  for (const x of list) {
    s.planned += x.planned; s.done += x.done; s.adapted += x.adapted; s.recovery += x.recovery; s.healthPause += x.healthPause; s.skipped += x.skipped; s.paused += x.paused;
    s.postponed += x.postponed; s.undocumented += x.undocumented; s.open += x.open; s.extra += x.extra;
  }
  return finalize(s);
}

/** Consecutive planned occurrences done, counting back from today; skipped/paused don't break it. */
export function currentStreak(habit: Habit, entries: HabitEntry[], today: LocalDate, maxDays = 365): number {
  if (habit.scheduleType === 'times_per_week') return 0;
  const idx = indexEntries(entries.filter((e) => e.habitId === habit.id));
  let streak = 0;
  for (let i = 0; i < maxDays; i++) {
    const d = addDays(today, -i);
    if (compareDates(d, habit.startDate) < 0) break;
    if (!isScheduledOn(habit, d)) continue;
    const e = idx.get(entryKey(habit.id, d));
    if (!e) {
      if (i === 0) continue; // today still open
      break;
    }
    if (isFulfilled(e.status)) streak++; // skipped / paused / health_pause never break a streak
  }
  return streak;
}

export interface DayPoint {
  date: LocalDate;
  done: number;
  /** null = nothing was planned / evaluated that day (rendered as gap, not as 0) */
  rate: number | null;
}

export function dailySeries(habits: Habit[], entries: HabitEntry[], start: LocalDate, end: LocalDate, today: LocalDate): DayPoint[] {
  return eachDay(start, end).map((d) => {
    const st = combineStats(habits.filter((h) => h.scheduleType !== 'times_per_week').map((h) => habitStats(h, entries, d, d, today)));
    const doneAll = entries.filter((e) => e.localDate === d && isFulfilled(e.status) && habits.some((h) => h.id === e.habitId)).length;
    return { date: d, done: doneAll, rate: st.rate };
  });
}
