import { defaultFieldsFor } from '../domain/phases';
import type { FieldInput, HabitInput, LocalDate, TimeOfDay } from '../domain/types';

type Template = Parameters<typeof defaultFieldsFor>[0];

/** Suggestions only – users can create and rename anything. */
export const ACTIVITY_PRESETS: { key: string; icon: string; category: string; template: Template }[] = [
  { key: 'strength', icon: 'barbell-outline', category: 'training', template: 'training' },
  { key: 'running', icon: 'walk-outline', category: 'training', template: 'endurance' },
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

export function habitFromName(
  name: string,
  presetKey: string | null,
  opts: { startDate: LocalDate; reminderTime: TimeOfDay | null; sortOrder: number },
): { input: HabitInput; fields: FieldInput[] } {
  const p = ACTIVITY_PRESETS.find((x) => x.key === presetKey);
  return {
    input: {
      name, category: p?.category ?? 'general', icon: p?.icon ?? 'ellipse-outline', description: '', goal: '',
      scheduleType: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 7], timesPerWeek: null,
      reminderTime: opts.reminderTime, reminderEnabled: !!opts.reminderTime, startDate: opts.startDate,
      phase: 1, status: 'active', pausePeriods: [], sortOrder: opts.sortOrder,
    },
    fields: defaultFieldsFor(p?.template ?? 'generic'),
  };
}
