import { addDays, compareDates, diffDays } from './dates';
import { habitStats, type HabitStats } from './stats';
import type { FieldInput, Habit, HabitEntry, LocalDate, Phase, Profile } from './types';

/** Minimum evaluated occurrences before any suggestion is made. */
export const MIN_EVALUATED = 5;
/** How long a dismissed suggestion stays hidden. */
export const DISMISS_DAYS = 7;

export interface PhaseSuggestion {
  habitId: string;
  from: Phase;
  to: Phase;
  stats: HabitStats;
  windowStart: LocalDate;
  windowEnd: LocalDate;
}

/**
 * Suggest (never force) moving to the next phase.
 * Based on actual regularity in a configurable window ending yesterday, the
 * user's configurable orientation threshold (default 80 %, NOT a scientific value)
 * and a minimum amount of evaluated data. Time alone never triggers it.
 */
export function phaseSuggestion(habit: Habit, entries: HabitEntry[], profile: Profile, today: LocalDate): PhaseSuggestion | null {
  if (habit.status !== 'active' || habit.phase >= 5) return null;
  if (habit.phaseSuggestionDismissedUntil && compareDates(today, habit.phaseSuggestionDismissedUntil) <= 0) return null;
  const windowEnd = addDays(today, -1);
  const windowStart = addDays(today, -profile.phaseWindowDays);
  if (diffDays(habit.startDate, windowEnd) < 6) return null;
  const stats = habitStats(habit, entries, windowStart, windowEnd, today);
  if (stats.rate === null || stats.done + stats.undocumented < MIN_EVALUATED) return null;
  if (stats.rate < profile.phaseThreshold) return null;
  return { habitId: habit.id, from: habit.phase, to: (habit.phase + 1) as Phase, stats, windowStart, windowEnd };
}

/**
 * Habit Expansion (guided mode): suggest adding a new habit when every active
 * habit is regular. Returns null when there is not enough data.
 */
export function expansionReady(habits: Habit[], entries: HabitEntry[], profile: Profile, today: LocalDate): boolean {
  const active = habits.filter((h) => h.status === 'active');
  if (!active.length) return true;
  return active.every((h) => {
    const s = habitStats(h, entries, addDays(today, -profile.phaseWindowDays), addDays(today, -1), today);
    return s.rate !== null && s.done + s.undocumented >= MIN_EVALUATED && s.rate >= profile.phaseThreshold;
  });
}

/** Guided mode: recommended maximum of new habits at the start. */
export const GUIDED_START_LIMIT = 3;

/**
 * Default tracking depth templates. Phase 1 is always a plain yes/no check.
 * Users can edit, rename or remove every field.
 */
export function defaultFieldsFor(template: 'generic' | 'sleep' | 'training' | 'endurance' | 'none'): FieldInput[] {
  const f = (key: string, label: string, type: FieldInput['type'], unit: string, minPhase: Phase, sortOrder: number): FieldInput => ({
    key, label, type, unit, minPhase, sortOrder, archived: false,
  });
  switch (template) {
    case 'sleep':
      return [
        f('bedtime', 'Schlafenszeit', 'time', '', 2, 0),
        f('wake_time', 'Aufstehzeit', 'time', '', 2, 1),
        f('sleep_duration', 'Schlafdauer', 'number', 'h', 3, 2),
        f('sleep_quality', 'Schlafqualität', 'rating_1_5', '', 3, 3),
      ];
    case 'training':
      return [
        f('duration', 'Dauer', 'duration_min', 'min', 2, 0),
        f('intensity', 'Intensität', 'rating_1_5', '', 3, 1),
      ];
    case 'endurance':
      return [
        f('duration', 'Dauer', 'duration_min', 'min', 2, 0),
        f('distance', 'Distanz', 'number', 'km', 3, 1),
      ];
    case 'generic':
      return [f('duration', 'Dauer', 'duration_min', 'min', 2, 0)];
    case 'none':
      return [];
  }
}

export function slugKey(label: string, existing: string[]): string {
  const base = label
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 34) || 'feld';
  let key = base;
  let i = 2;
  while (existing.includes(key)) key = `${base}_${i++}`;
  return key;
}
