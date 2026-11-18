import type { Habit, HabitEntry, HabitInput } from '../domain/types';

let n = 0;
export const seqId = () => `id-${++n}`;

export function habitInput(over: Partial<HabitInput> = {}): HabitInput {
  return {
    name: 'Lesen', category: 'mind', icon: 'book', description: '', goal: '',
    scheduleType: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 7], timesPerWeek: null,
    reminderTime: null, reminderEnabled: false, startDate: '2026-11-01', phase: 1,
    status: 'active', pausePeriods: [], sortOrder: 0, kind: 'habit', reminderAnchor: null, reminderOffsetMin: 0, ...over,
  };
}

export function habit(over: Partial<Habit> = {}): Habit {
  return { ...habitInput(), id: 'h1', phaseSuggestionDismissedUntil: null, createdAt: '', updatedAt: '', ...over } as Habit;
}

export function entry(localDate: string, status: HabitEntry['status'] = 'done', over: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: `e-${localDate}-${over.habitId ?? 'h1'}`, habitId: 'h1', localDate, status, postponedTo: null, values: {},
    fieldSnapshot: [], habitNameSnapshot: 'Lesen', note: '', rpe: null, completedAt: null, createdAt: '', updatedAt: '', ...over,
  };
}
