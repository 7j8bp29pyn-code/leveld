import { currentCycle, deloadHint, featuresForLevel, isPlannedRestDay, LEVEL_DEFAULTS, trainingFieldsFor } from '../training';
import { feedbackFor, isComeback } from '../motivation';
import { habitStats, currentStreak } from '../stats';
import { DEFAULT_PROFILE, type DailyCheckin, type TrainingCycle } from '../types';
import { entry, habit } from '../../test/fixtures';

const off = DEFAULT_PROFILE.features;

describe('training levels (entry logic)', () => {
  it('beginners: no mandatory weights/reps – just check it off', () => {
    expect(trainingFieldsFor('beginner', off)).toEqual([]);
    expect(LEVEL_DEFAULTS.beginner.trainingPhase).toBe(1);
    expect(LEVEL_DEFAULTS.beginner.startLimit).toBeLessThan(LEVEL_DEFAULTS.regular.startLimit);
  });

  it('regular/structured: exercises, sets, reps, weight; structured adds volume and cycles', () => {
    const reg = featuresForLevel('regular', off);
    expect(reg).toMatchObject({ detailedLogging: true, rpe: true, cycles: false });
    expect(trainingFieldsFor('regular', reg).map((f) => f.key)).toEqual(['duration', 'exercises', 'sets', 'reps', 'weight']);
    const str = featuresForLevel('structured', off);
    expect(str.cycles).toBe(true);
    expect(trainingFieldsFor('structured', str).map((f) => f.key)).toContain('volume');
  });

  it('level is not a hard restriction: user-enabled features survive a level change; check-in untouched', () => {
    const mine = { detailedLogging: false, rpe: false, cycles: true, checkin: true };
    expect(featuresForLevel('beginner', mine)).toEqual(mine);
    expect(featuresForLevel('structured', { ...off, checkin: false }).checkin).toBe(false);
  });
});

describe('cycles', () => {
  const cycle = (over: Partial<TrainingCycle>): TrainingCycle => ({
    id: 'c', name: 'Block', goal: '', phase: 'load', startDate: '2026-11-01', endDate: '2026-11-30', sessionsPerWeek: 3,
    restWeekdays: [7], notes: '', confirmedBy: 'user', createdAt: '', updatedAt: '', ...over,
  });
  const ci = (localDate: string, readiness: DailyCheckin['readiness']): DailyCheckin => ({
    id: localDate, localDate, readiness, sleepHours: null, sleepQuality: null, stress: null, soreness: null, symptoms: [], redFlags: [], note: '', createdAt: '', updatedAt: '',
  });

  it('finds the current phase and planned rest days', () => {
    const c = cycle({});
    expect(currentCycle([c], '2026-11-18')?.phase).toBe('load');
    expect(currentCycle([c], '2026-12-01')).toBeNull();
    expect(isPlannedRestDay(c, '2026-11-22')).toBe(true); // Sunday
  });

  it('only HINTS a deload after ≥3 exhausted/sick days in 7 – never during deload', () => {
    const checkins = [ci('2026-11-14', 'exhausted'), ci('2026-11-16', 'sick'), ci('2026-11-18', 'exhausted'), ci('2026-11-10', 'exhausted')];
    expect(deloadHint([cycle({})], checkins, '2026-11-18')).toEqual({ exhaustedDays: 3, windowDays: 7 });
    expect(deloadHint([cycle({})], checkins.slice(1), '2026-11-18')).toBeNull();
    expect(deloadHint([cycle({ phase: 'deload' })], checkins, '2026-11-18')).toBeNull();
  });
});

describe('recovery & motivation', () => {
  it('adapted and recovery count as fulfilled; health_pause and skipped never as failure', () => {
    const h = habit({ kind: 'training', startDate: '2026-11-12' });
    const e = [entry('2026-11-12'), entry('2026-11-13', 'adapted'), entry('2026-11-14', 'recovery'), entry('2026-11-15', 'health_pause'), entry('2026-11-16', 'skipped')];
    const s = habitStats(h, e, '2026-11-12', '2026-11-16', '2026-11-18');
    expect(s).toMatchObject({ done: 3, adapted: 1, recovery: 1, healthPause: 1, skipped: 1, undocumented: 0, rate: 1 });
    expect(currentStreak(h, [...e, entry('2026-11-17')], '2026-11-18')).toBe(4); // pauses don't break the streak
  });

  it('a planned rest day counts as success when the recovery task is done', () => {
    const rest = habit({ kind: 'recovery', scheduleType: 'weekdays', weekdays: [7], startDate: '2026-11-01' });
    expect(habitStats(rest, [entry('2026-11-15')], '2026-11-09', '2026-11-15', '2026-11-18').rate).toBe(1);
    expect(feedbackFor('supportive', rest, 'done', false)?.key).toBe('motivation.supportive.rest_day');
  });

  it('feedback depends only on the chosen style and what happened', () => {
    const h = habit({ name: 'Tennis' });
    expect(feedbackFor('humorous', h, 'done', false)).toEqual({ key: 'motivation.humorous.done', params: { name: 'Tennis' } });
    expect(feedbackFor('factual', h, 'adapted', false)?.key).toBe('motivation.factual.adapted');
    expect(feedbackFor('supportive', h, 'health_pause', false)?.key).toBe('motivation.supportive.health_pause');
    expect(feedbackFor('supportive', h, 'skipped', false)).toBeNull(); // no comment, no shaming
  });

  it('recognises a comeback after a break', () => {
    const h = habit();
    expect(isComeback(h, [entry('2026-11-01')], '2026-11-18')).toBe(true);
    expect(isComeback(h, [entry('2026-11-15')], '2026-11-18')).toBe(false);
    expect(isComeback(h, [], '2026-11-18')).toBe(false);
  });
});

describe('setup answers', () => {
  const answers = {
    level: 'regular' as const, goals: ['Kraft steigern'], start: 'existing_plan' as const, days: [1, 3, 5] as (1 | 3 | 5)[], settings: ['gym'],
    limitations: '  Knie  ', checkin: false, style: 'factual' as const, rhythm: 'standard' as const,
    anchors: DEFAULT_PROFILE.anchors, dayStartHour: 3,
  };
  const { setupPatch } = jest.requireActual('../training') as typeof import('../training');

  it('stores level, goals and preferences separately; check-in only with consent', () => {
    const p = setupPatch(DEFAULT_PROFILE, answers, '2026-11-18T10:00:00Z');
    expect(p).toMatchObject({ trainingLevel: 'regular', startPreference: 'existing_plan', trainingLimitations: 'Knie', healthConsentAt: null });
    expect(p.features).toMatchObject({ detailedLogging: true, rpe: true, checkin: false });
    const withConsent = setupPatch(DEFAULT_PROFILE, { ...answers, checkin: true }, '2026-11-18T10:00:00Z');
    expect(withConsent).toMatchObject({ healthConsentAt: '2026-11-18T10:00:00Z', features: { checkin: true } });
  });

  it('skipping optional answers keeps existing values and assumes nothing', () => {
    const current = { ...DEFAULT_PROFILE, trainingLevel: 'beginner' as const, goals: ['alt'] };
    const p = setupPatch(current, { ...answers, level: null, start: null, goals: [], days: [], settings: [], limitations: '' }, 'x');
    expect(p).toMatchObject({ trainingLevel: 'beginner', goals: ['alt'], startPreference: null, trainingDays: [] });
    expect(p.features).toEqual(DEFAULT_PROFILE.features);
  });
});
