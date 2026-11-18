import { defaultFieldsFor } from '../domain/phases';
import { LEVEL_DEFAULTS, trainingFieldsFor } from '../domain/training';
import type { FeatureFlags, FieldInput, HabitInput, HabitKind, LocalDate, ReminderAnchor, TimeOfDay, TrainingLevel, Weekday } from '../domain/types';

type Template = Parameters<typeof defaultFieldsFor>[0];

/** Suggestions only – users can create and rename anything. */
export const ACTIVITY_PRESETS: { key: string; icon: string; category: string; template: Template; kind?: HabitKind }[] = [
  { key: 'strength', icon: 'barbell-outline', category: 'training', template: 'training', kind: 'training' },
  { key: 'running', icon: 'walk-outline', category: 'training', template: 'endurance', kind: 'training' },
  { key: 'rest', icon: 'bed-outline', category: 'health', template: 'none', kind: 'recovery' },
  { key: 'walk', icon: 'footsteps-outline', category: 'movement', template: 'generic' },
  { key: 'yoga', icon: 'body-outline', category: 'movement', template: 'generic' },
  { key: 'mobility', icon: 'accessibility-outline', category: 'movement', template: 'generic' },
  { key: 'meditation', icon: 'leaf-outline', category: 'mind', template: 'generic' },
  { key: 'reading', icon: 'book-outline', category: 'learning', template: 'generic' },
  { key: 'sleep', icon: 'moon-outline', category: 'sleep', template: 'sleep' },
  { key: 'water', icon: 'water-outline', category: 'nutrition', template: 'none' },
  { key: 'learning', icon: 'school-outline', category: 'learning', template: 'generic' },
];

export const GOAL_KEYS = ['routine', 'fitness', 'strength', 'sleep', 'nutrition', 'focus', 'health', 'learning'] as const;

export interface HabitOptions {
  startDate: LocalDate;
  reminderTime: TimeOfDay | null;
  reminderAnchor?: ReminderAnchor | null;
  reminderOffsetMin?: number;
  sortOrder: number;
  kind?: HabitKind;
  level?: TrainingLevel | null;
  features?: FeatureFlags;
  /** weekdays for training habits (from the onboarding); empty = flexible 3× per week */
  trainingDays?: Weekday[];
}

/**
 * Builds a new habit from a name/preset. Training habits get phase and fields from the
 * user's level (beginners: just check it off – no weights/reps required).
 */
export function habitFromName(name: string, presetKey: string | null, o: HabitOptions): { input: HabitInput; fields: FieldInput[] } {
  const p = ACTIVITY_PRESETS.find((x) => x.key === presetKey);
  const kind: HabitKind = o.kind ?? p?.kind ?? 'habit';
  const training = kind === 'training';
  const all: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
  // training on the chosen days; a recovery task on the remaining days
  const days = training && o.trainingDays?.length ? o.trainingDays
    : kind === 'recovery' && o.trainingDays?.length && o.trainingDays.length < 7 ? all.filter((d) => !o.trainingDays!.includes(d)) : null;
  const reminderOn = !!(o.reminderTime || o.reminderAnchor);
  return {
    input: {
      name, category: p?.category ?? (training ? 'training' : 'general'), icon: p?.icon ?? (training ? 'barbell-outline' : 'ellipse-outline'),
      description: '', goal: '',
      scheduleType: days ? 'weekdays' : training ? 'times_per_week' : 'daily',
      weekdays: days ?? all, timesPerWeek: training && !days ? 3 : null,
      reminderTime: o.reminderTime, reminderEnabled: reminderOn, reminderAnchor: o.reminderAnchor ?? null, reminderOffsetMin: o.reminderOffsetMin ?? 0,
      startDate: o.startDate, kind,
      phase: training && o.level ? LEVEL_DEFAULTS[o.level].trainingPhase : 1,
      status: 'active', pausePeriods: [], sortOrder: o.sortOrder,
    },
    fields: training && o.level && o.features ? trainingFieldsFor(o.level, o.features) : defaultFieldsFor(p?.template ?? 'generic'),
  };
}
