import { addDays, diffDays, eachDay } from './dates';
import type { Habit, HabitEntry, LocalDate, StepEntry, StepSettings } from './types';

/**
 * Steps per day. Rule against double counting: an automatically imported value
 * (Apple Health / Health Connect) wins over a manual one for the same day; values of
 * different sources are never added up. Missing days stay null (≠ 0).
 */
export function stepsForDay(entries: StepEntry[], day: LocalDate): number | null {
  const own = entries.filter((e) => e.localDate === day);
  if (!own.length) return null;
  const auto = own.filter((e) => e.source !== 'manual');
  if (auto.length) return Math.max(...auto.map((e) => e.steps));
  return own[0].steps;
}

export function stepSeries(entries: StepEntry[], start: LocalDate, end: LocalDate): { date: LocalDate; steps: number | null }[] {
  return eachDay(start, end).map((date) => ({ date, steps: stepsForDay(entries, date) }));
}

export interface StepStats {
  daysWithData: number;
  total: number;
  /** average over days WITH data; null if none */
  average: number | null;
  daysGoalReached: number;
}

export function stepStats(entries: StepEntry[], start: LocalDate, end: LocalDate, goal: number): StepStats {
  const values = stepSeries(entries, start, end).map((x) => x.steps).filter((v): v is number => v !== null);
  const total = values.reduce((a, b) => a + b, 0);
  return {
    daysWithData: values.length,
    total,
    average: values.length ? Math.round(total / values.length) : null,
    daysGoalReached: values.filter((v) => v >= goal).length,
  };
}

/** Same-length period directly before [start, end] – for comparisons. */
export function previousPeriod(start: LocalDate, end: LocalDate): { start: LocalDate; end: LocalDate } {
  const len = diffDays(start, end) + 1;
  return { start: addDays(start, -len), end: addDays(start, -1) };
}

/** Relative change of the averages in percent; null if one side has no data. */
export function averageChange(current: StepStats, previous: StepStats): number | null {
  if (current.average === null || previous.average === null || previous.average === 0) return null;
  return Math.round(((current.average - previous.average) / previous.average) * 100);
}

export function validateSteps(steps: number): number {
  if (!Number.isInteger(steps) || steps < 0 || steps > 200000) throw new Error('out_of_range');
  return steps;
}

/**
 * Habits to tick off automatically for a day: rule threshold reached, habit active,
 * and no entry yet (an existing entry – also skipped/paused – is never overwritten).
 */
export function habitsToAutoComplete(settings: StepSettings, habits: Habit[], entries: HabitEntry[], day: LocalDate, steps: number | null): Habit[] {
  if (steps === null) return [];
  return settings.autoHabits
    .filter((r) => steps >= r.minSteps)
    .map((r) => habits.find((h) => h.id === r.habitId))
    .filter((h): h is Habit => !!h && h.status === 'active')
    .filter((h) => !entries.some((e) => e.habitId === h.id && e.localDate === day));
}
