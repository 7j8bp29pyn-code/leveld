/** ISO calendar date in the user's local time zone, e.g. "2026-11-17". */
export type LocalDate = string;
/** "HH:MM" 24h */
export type TimeOfDay = string;

export type Mode = 'guided' | 'custom';
export type Locale = 'de' | 'en' | 'pl' | 'ru';
export type Phase = 1 | 2 | 3 | 4 | 5;
export type HabitStatus = 'active' | 'paused' | 'archived';
export type ScheduleType = 'daily' | 'weekdays' | 'times_per_week';
/** ISO weekday 1 = Monday … 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type EntryStatus = 'done' | 'skipped' | 'paused' | 'postponed';
export type FieldType = 'number' | 'duration_min' | 'text' | 'boolean' | 'time' | 'rating_1_5';

export interface Profile {
  displayName: string;
  goals: string[];
  /** Activity ideas kept for later (guided mode – Habit Expansion). */
  habitBacklog: string[];
  mode: Mode;
  locale: Locale;
  timezone: string;
  defaultReminderTime: TimeOfDay | null;
  /** Orientation value (not a scientific threshold) – configurable 0.5..1 */
  phaseThreshold: number;
  phaseWindowDays: number;
  onboardingCompleted: boolean;
}

export interface FieldDefinition {
  id: string;
  habitId: string;
  key: string;
  label: string;
  type: FieldType;
  unit: string;
  minPhase: Phase;
  sortOrder: number;
  archived: boolean;
}

export interface Habit {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  goal: string;
  scheduleType: ScheduleType;
  weekdays: Weekday[];
  timesPerWeek: number | null;
  reminderTime: TimeOfDay | null;
  reminderEnabled: boolean;
  startDate: LocalDate;
  phase: Phase;
  status: HabitStatus;
  /** Inclusive periods; end null = still paused. Paused days never count as failure. */
  pausePeriods: PausePeriod[];
  sortOrder: number;
  phaseSuggestionDismissedUntil: LocalDate | null;
  createdAt: string;
  updatedAt: string;
}

export interface PausePeriod {
  start: LocalDate;
  end: LocalDate | null;
}

export type FieldValue = number | string | boolean | null;

export interface FieldSnapshot {
  key: string;
  label: string;
  type: FieldType;
  unit: string;
}

export interface HabitEntry {
  id: string;
  habitId: string;
  localDate: LocalDate;
  status: EntryStatus;
  postponedTo: LocalDate | null;
  values: Record<string, FieldValue>;
  fieldSnapshot: FieldSnapshot[];
  habitNameSnapshot: string;
  note: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhaseChange {
  id: string;
  habitId: string;
  fromPhase: Phase;
  toPhase: Phase;
  reason: 'user' | 'suggestion_accepted';
  createdAt: string;
}

export type HabitInput = Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'phaseSuggestionDismissedUntil'> & {
  phaseSuggestionDismissedUntil?: LocalDate | null;
};

export type FieldInput = Omit<FieldDefinition, 'id' | 'habitId'> & { id?: string };

export interface EntryInput {
  habitId: string;
  localDate: LocalDate;
  status: EntryStatus;
  postponedTo?: LocalDate | null;
  values?: Record<string, FieldValue>;
  note?: string;
}

export const PHASES: Phase[] = [1, 2, 3, 4, 5];

export const DEFAULT_PROFILE: Profile = {
  displayName: '',
  goals: [],
  habitBacklog: [],
  mode: 'guided',
  locale: 'de',
  timezone: 'Europe/Berlin',
  defaultReminderTime: null,
  phaseThreshold: 0.8,
  phaseWindowDays: 14,
  onboardingCompleted: false,
};
