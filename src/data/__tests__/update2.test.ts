import { LocalRepository, MemoryStore } from '../localRepository';
import { habitInput, seqId } from '../../test/fixtures';
import { ValidationError } from '../../domain/entries';
import { mapProfile } from '../supabaseRepository';

jest.mock('@supabase/supabase-js', () => ({}));

/** Data exactly as written by the first app version (schemaVersion 1). */
const V1 = {
  schemaVersion: 1,
  profile: { displayName: 'Alex', goals: ['Besser schlafen'], habitBacklog: ['Meditation'], mode: 'guided', locale: 'de', timezone: 'Europe/Berlin',
    defaultReminderTime: '21:30', phaseThreshold: 0.8, phaseWindowDays: 14, onboardingCompleted: true },
  habits: [{ id: 'h1', name: 'Tennis', category: 'training', icon: 'tennisball-outline', description: '', goal: '', scheduleType: 'daily',
    weekdays: [1, 2, 3, 4, 5, 6, 7], timesPerWeek: null, reminderTime: '21:30', reminderEnabled: true, startDate: '2026-11-17', phase: 2,
    status: 'active', pausePeriods: [], sortOrder: 0, phaseSuggestionDismissedUntil: null, createdAt: 'x', updatedAt: 'x' }],
  fields: [],
  entries: [{ id: 'e1', habitId: 'h1', localDate: '2026-11-17', status: 'done', postponedTo: null, values: {}, fieldSnapshot: [],
    habitNameSnapshot: 'Pole Dance', note: '', completedAt: 'x', createdAt: 'x', updatedAt: 'x' }],
  phaseChanges: [],
};

const setup = async (raw?: object) => {
  const store = new MemoryStore();
  if (raw) await store.setItem('leveld.v1.data', JSON.stringify(raw));
  return { store, repo: new LocalRepository(store, seqId) };
};

describe('existing user data after the update', () => {
  it('loads v1 data unchanged and fills new fields with neutral defaults', async () => {
    const { repo } = await setup(V1);
    const s = await repo.load('2026-01-01');
    expect(s.profile).toMatchObject({ displayName: 'Alex', onboardingCompleted: true, trainingLevel: null, communicationStyle: 'supportive' });
    expect(s.profile.features).toEqual({ detailedLogging: false, rpe: false, cycles: false, checkin: false });
    expect(s.profile.healthConsentAt).toBeNull(); // no health processing without consent
    expect(s.habits[0]).toMatchObject({ name: 'Tennis', phase: 2, kind: 'habit', reminderAnchor: null, reminderTime: '21:30' });
    expect(s.entries[0]).toMatchObject({ habitNameSnapshot: 'Pole Dance', status: 'done', rpe: null });
    expect(s.checkins).toEqual([]);
  });

  it('keeps v1 data when saving new settings (level change, rhythm)', async () => {
    const { repo, store } = await setup(V1);
    const s = await repo.load('2026-01-01');
    await repo.saveProfile({ ...s.profile, trainingLevel: 'regular', dayRhythm: 'night' });
    const again = await new LocalRepository(store, seqId).load('2026-01-01');
    expect(again.profile).toMatchObject({ trainingLevel: 'regular', dayRhythm: 'night', habitBacklog: ['Meditation'] });
    expect(again.entries).toHaveLength(1);
  });

  it('supabase rows without the new columns map to defaults', () => {
    const p = mapProfile({ display_name: 'A', goals: [], mode: 'guided', locale: 'de', timezone: 'Europe/Berlin', phase_threshold: '0.8',
      phase_window_days: 14, onboarding_completed: true });
    expect(p).toMatchObject({ trainingLevel: null, dayRhythm: 'standard', dayStartHour: 3, features: { checkin: false } });
  });
});

describe('check-ins, cycles, schedules', () => {
  const ci = { localDate: '2026-11-18', readiness: 'tired' as const, sleepHours: null, sleepQuality: null, stress: null, soreness: null,
    symptoms: [], redFlags: [], note: '' };

  it('one check-in per day; optional values may be skipped; can be corrected and deleted', async () => {
    const { repo } = await setup();
    const a = await repo.upsertCheckin(ci);
    const b = await repo.upsertCheckin({ ...ci, readiness: 'fit', sleepHours: 7.5 });
    const s = await repo.load('2026-01-01');
    expect(s.checkins).toHaveLength(1);
    expect(b.id).toBe(a.id);
    expect(s.checkins[0]).toMatchObject({ readiness: 'fit', sleepHours: 7.5, stress: null });
    await repo.upsertCheckin({ ...ci, localDate: '2026-11-19' });
    await repo.deleteAllCheckins();
    expect((await repo.load('2026-01-01')).checkins).toEqual([]);
  });

  it('rejects out-of-range values and drops unknown symptoms', async () => {
    const { repo } = await setup();
    await expect(repo.upsertCheckin({ ...ci, stress: 9 })).rejects.toBeInstanceOf(ValidationError);
    const c = await repo.upsertCheckin({ ...ci, symptoms: ['fever', 'made_up' as never] });
    expect(c.symptoms).toEqual(['fever']);
  });

  it('stores adapted/recovery statuses with RPE; RPE only for real sessions', async () => {
    const { repo } = await setup();
    const { habit } = await repo.createHabit({ ...habitInput(), kind: 'training' }, []);
    expect(habit.kind).toBe('training');
    expect((await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-18', status: 'adapted', rpe: 5 })).rpe).toBe(5);
    expect((await repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-18', status: 'recovery' })).rpe).toBeNull();
    await expect(repo.upsertEntry({ habitId: habit.id, localDate: '2026-11-17', status: 'done', rpe: 11 })).rejects.toThrow('invalid_rpe');
  });

  it('validates cycles and day schedules', async () => {
    const { repo } = await setup();
    const cyc = { name: 'Block 1', goal: '', phase: 'load' as const, startDate: '2026-11-01', endDate: '2026-11-28', sessionsPerWeek: 3,
      restWeekdays: [7 as const], notes: '', confirmedBy: 'user' as const };
    const saved = await repo.saveCycle(cyc);
    await repo.saveCycle({ ...cyc, phase: 'deload' }, saved.id);
    expect((await repo.load('2026-01-01')).cycles).toMatchObject([{ id: saved.id, phase: 'deload' }]);
    await expect(repo.saveCycle({ ...cyc, endDate: '2026-10-01' })).rejects.toThrow('end_before_start');
    await repo.upsertDaySchedule({ localDate: '2026-11-18', shift: 'off', anchors: { wake: '09:00', firstMeal: '10:00', workEnd: null, bedtime: '23:30' } });
    await expect(repo.upsertDaySchedule({ localDate: '2026-11-19', shift: 'custom', anchors: { wake: '9', firstMeal: '10:00', workEnd: null, bedtime: '23:30' } }))
      .rejects.toThrow('invalid_time');
    expect((await repo.load('2026-01-01')).daySchedules).toHaveLength(1);
  });
});
