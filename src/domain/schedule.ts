import { addDays, compareDates, eachDay, isoWeekday, startOfIsoWeek } from './dates';
import type { FieldDefinition, Habit, HabitEntry, LocalDate } from './types';

export function isPausedOn(habit: Habit, d: LocalDate): boolean {
  return habit.pausePeriods.some((p) => d >= p.start && (p.end === null || d <= p.end));
}

/** Is the habit eligible on that day at all (started, not archived, not paused)? */
export function isEligibleOn(habit: Habit, d: LocalDate): boolean {
  if (habit.status === 'archived') return false;
  if (compareDates(d, habit.startDate) < 0) return false;
  return !isPausedOn(habit, d);
}

/**
 * Is the habit regularly planned on that day?
 * times_per_week habits have no fixed day – they are "flexible" (see weeklyProgress).
 */
export function isScheduledOn(habit: Habit, d: LocalDate): boolean {
  if (!isEligibleOn(habit, d)) return false;
  switch (habit.scheduleType) {
    case 'daily':
      return true;
    case 'weekdays':
      return habit.weekdays.includes(isoWeekday(d));
    case 'times_per_week':
      return false;
  }
}

export type EntryIndex = Map<string, HabitEntry>;
export const entryKey = (habitId: string, d: LocalDate) => `${habitId}|${d}`;

export function indexEntries(entries: HabitEntry[]): EntryIndex {
  const m: EntryIndex = new Map();
  for (const e of entries) m.set(entryKey(e.habitId, e.localDate), e);
  return m;
}

/** Entries that were postponed *to* day d for this habit. */
export function postponedInto(habitId: string, d: LocalDate, entries: HabitEntry[]): HabitEntry[] {
  return entries.filter((e) => e.habitId === habitId && e.status === 'postponed' && e.postponedTo === d);
}

export interface WeeklyProgress {
  target: number;
  done: number;
}

export function weeklyProgress(habit: Habit, d: LocalDate, idx: EntryIndex): WeeklyProgress {
  const start = startOfIsoWeek(d);
  let done = 0;
  for (const day of eachDay(start, addDays(start, 6))) {
    if (idx.get(entryKey(habit.id, day))?.status === 'done') done++;
  }
  return { target: habit.timesPerWeek ?? 1, done };
}

export type TodayKind = 'scheduled' | 'flexible' | 'postponed_in';

export interface TodayItem {
  habit: Habit;
  kind: TodayKind;
  entry: HabitEntry | null;
  /** Origin dates when the occurrence was postponed into this day. */
  postponedFrom: LocalDate[];
  weekly: WeeklyProgress | null;
}

/**
 * Items to show on the "HEUTE" dashboard for day d.
 * A flexible (x per week) habit is shown until its weekly target is reached,
 * and stays visible on the day it was completed.
 */
export function itemsForDay(habits: Habit[], entries: HabitEntry[], d: LocalDate): TodayItem[] {
  const idx = indexEntries(entries);
  const items: TodayItem[] = [];
  for (const habit of habits) {
    if (habit.status === 'archived') continue;
    const entry = idx.get(entryKey(habit.id, d)) ?? null;
    const from = postponedInto(habit.id, d, entries).map((e) => e.localDate);
    if (isScheduledOn(habit, d)) {
      items.push({ habit, kind: 'scheduled', entry, postponedFrom: from, weekly: null });
    } else if (habit.scheduleType === 'times_per_week' && isEligibleOn(habit, d)) {
      const weekly = weeklyProgress(habit, d, idx);
      if (weekly.done < weekly.target || entry) {
        items.push({ habit, kind: 'flexible', entry, postponedFrom: from, weekly });
      } else if (from.length) {
        items.push({ habit, kind: 'postponed_in', entry, postponedFrom: from, weekly });
      }
    } else if (from.length && habit.status !== 'paused') {
      items.push({ habit, kind: 'postponed_in', entry, postponedFrom: from, weekly: null });
    } else if (entry && entry.status === 'done') {
      // done on an unplanned day (extra session) – still show it so it can be corrected
      items.push({ habit, kind: 'postponed_in', entry, postponedFrom: [], weekly: null });
    }
  }
  return items.sort(compareTodayItems);
}

function compareTodayItems(a: TodayItem, b: TodayItem): number {
  const aDone = a.entry ? 1 : 0;
  const bDone = b.entry ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  const at = a.habit.reminderTime ?? '99:99';
  const bt = b.habit.reminderTime ?? '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.habit.sortOrder - b.habit.sortOrder || a.habit.name.localeCompare(b.habit.name);
}

/** Next open item: earliest reminder time at/after `now` ("HH:MM"), else first open one. */
export function nextItem(items: TodayItem[], nowTime: string): TodayItem | null {
  const open = items.filter((i) => !i.entry);
  if (!open.length) return null;
  const timed = open.filter((i) => i.habit.reminderTime && i.habit.reminderTime >= nowTime);
  return timed[0] ?? open[0];
}

/** Fields shown in the entry form for the habit's current phase ("Habit Depth"). */
export function visibleFields(habit: Habit, fields: FieldDefinition[]): FieldDefinition[] {
  return fields
    .filter((f) => f.habitId === habit.id && !f.archived && f.minPhase <= habit.phase)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
