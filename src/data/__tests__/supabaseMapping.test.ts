import { mapEntry, mapField, mapHabit, mapProfile } from '../supabaseRepository';

jest.mock('@supabase/supabase-js', () => ({}));

describe('Supabase row mapping', () => {
  it('maps habit rows incl. time truncation and defaults', () => {
    const h = mapHabit({
      id: 'h', name: 'Tennis', category: 'training', icon: 'tennisball-outline', description: '', goal: '3×/Woche',
      schedule_type: 'weekdays', weekdays: [1, 3], times_per_week: null, reminder_time: '18:30:00', reminder_enabled: true,
      start_date: '2026-11-01', phase: 2, status: 'active', pause_periods: null, sort_order: 0,
      phase_suggestion_dismissed_until: null, created_at: 'c', updated_at: 'u',
    });
    expect(h).toMatchObject({ scheduleType: 'weekdays', weekdays: [1, 3], reminderTime: '18:30', pausePeriods: [], phase: 2 });
  });

  it('maps entries, fields and profile', () => {
    expect(mapEntry({ id: 'e', habit_id: 'h', local_date: '2026-11-17', status: 'done', postponed_to: null, field_values: { a: 1 },
      field_snapshot: [], habit_name_snapshot: 'Pole Dance', note: '', completed_at: null, created_at: '', updated_at: '' }))
      .toMatchObject({ habitId: 'h', values: { a: 1 }, habitNameSnapshot: 'Pole Dance' });
    expect(mapField({ id: 'f', habit_id: 'h', key: 'k', label: 'L', type: 'number', unit: 'kg', min_phase: 3, sort_order: 1, archived: false }))
      .toMatchObject({ habitId: 'h', minPhase: 3 });
    expect(mapProfile({ display_name: 'A', goals: [], habit_backlog: null, mode: 'custom', locale: 'de', timezone: 'Europe/Berlin',
      default_reminder_time: null, phase_threshold: '0.80', phase_window_days: 14, onboarding_completed: true }))
      .toMatchObject({ phaseThreshold: 0.8, habitBacklog: [], mode: 'custom' });
  });
});
