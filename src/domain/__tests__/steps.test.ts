import { averageChange, habitsToAutoComplete, previousPeriod, stepSeries, stepStats, stepsForDay } from '../steps';
import type { StepEntry } from '../types';
import { entry, habit } from '../../test/fixtures';

const s = (localDate: string, steps: number, source: StepEntry['source'] = 'manual'): StepEntry => ({ id: localDate + source, localDate, steps, source, updatedAt: '' });

describe('steps', () => {
  it('never double counts: automatic import wins over manual, sources are not added', () => {
    expect(stepsForDay([s('2026-11-22', 4000), s('2026-11-22', 6500, 'apple_health')], '2026-11-22')).toBe(6500);
    expect(stepsForDay([s('2026-11-22', 4000)], '2026-11-22')).toBe(4000);
    expect(stepsForDay([], '2026-11-22')).toBeNull();
  });

  it('missing days are null, averages only over days with data', () => {
    const e = [s('2026-11-16', 6000), s('2026-11-18', 10000)];
    expect(stepSeries(e, '2026-11-16', '2026-11-18').map((x) => x.steps)).toEqual([6000, null, 10000]);
    expect(stepStats(e, '2026-11-16', '2026-11-22', 8000)).toEqual({ daysWithData: 2, total: 16000, average: 8000, daysGoalReached: 1 });
    expect(stepStats([], '2026-11-16', '2026-11-22', 8000).average).toBeNull();
  });

  it('compares with the previous period of equal length', () => {
    expect(previousPeriod('2026-11-16', '2026-11-22')).toEqual({ start: '2026-11-09', end: '2026-11-15' });
    const cur = stepStats([s('2026-11-16', 9000)], '2026-11-16', '2026-11-22', 8000);
    const prev = stepStats([s('2026-11-10', 6000)], '2026-11-09', '2026-11-15', 8000);
    expect(averageChange(cur, prev)).toBe(50);
    expect(averageChange(cur, stepStats([], '2026-11-09', '2026-11-15', 8000))).toBeNull();
  });

  it('auto-completes "Gassi" at the threshold, never overwrites existing entries', () => {
    const gassi = habit({ id: 'g', name: 'Gassi' });
    const settings = { goal: 8000, autoHabits: [{ habitId: 'g', minSteps: 5000 }] };
    expect(habitsToAutoComplete(settings, [gassi], [], '2026-11-22', 5200)).toEqual([gassi]);
    expect(habitsToAutoComplete(settings, [gassi], [], '2026-11-22', 4999)).toEqual([]);
    expect(habitsToAutoComplete(settings, [gassi], [entry('2026-11-22', 'skipped', { habitId: 'g' })], '2026-11-22', 9000)).toEqual([]);
    expect(habitsToAutoComplete(settings, [habit({ id: 'g', status: 'paused' })], [], '2026-11-22', 9000)).toEqual([]);
  });
});
