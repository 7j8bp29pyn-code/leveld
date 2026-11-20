import { compareDates, diffDays } from './dates';
import { FULFILLED, type CommunicationStyle, type EntryStatus, type Habit, type HabitEntry, type LocalDate } from './types';

/**
 * Positive, pressure-free feedback. The style is chosen by the user – it is never derived
 * from gender or any other personal attribute (there is no such input).
 * No penalties, no lost points, no shaming texts.
 */
export type FeedbackCase = 'done' | 'adapted' | 'recovery' | 'rest_day' | 'health_pause' | 'comeback';

/** Number of text variants per style and case (rotated so it doesn't get monotonous). */
export const FEEDBACK_VARIANTS = 3;

export interface Feedback {
  /** i18n key: motivation.<style>.<case>.<variant> */
  key: string;
  params: { name: string };
}

/** Days without a fulfilled entry after which completing again counts as a comeback. */
export const COMEBACK_GAP_DAYS = 7;

export function isComeback(habit: Habit, entries: HabitEntry[], date: LocalDate): boolean {
  const prev = entries
    .filter((e) => e.habitId === habit.id && FULFILLED.includes(e.status) && compareDates(e.localDate, date) < 0)
    .sort((a, b) => b.localDate.localeCompare(a.localDate))[0];
  if (!prev) return false;
  return diffDays(prev.localDate, date) > COMEBACK_GAP_DAYS;
}

export function feedbackCase(habit: Habit, status: EntryStatus, comeback: boolean): FeedbackCase | null {
  if (status === 'health_pause') return 'health_pause';
  if (status === 'recovery') return 'recovery';
  if (status === 'adapted') return 'adapted';
  if (status !== 'done') return null; // skipped / paused / postponed → no comment at all
  if (habit.kind === 'recovery') return 'rest_day';
  return comeback ? 'comeback' : 'done';
}

export function feedbackFor(style: CommunicationStyle, habit: Habit, status: EntryStatus, comeback: boolean, variant = 0): Feedback | null {
  const c = feedbackCase(habit, status, comeback);
  const v = ((Math.floor(variant) % FEEDBACK_VARIANTS) + FEEDBACK_VARIANTS) % FEEDBACK_VARIANTS;
  return c ? { key: `motivation.${style}.${c}.${v}`, params: { name: habit.name } } : null;
}
