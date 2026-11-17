import { habitStats, currentStreak, combineStats } from '../stats';
import { itemsForDay, nextItem, visibleFields } from '../schedule';
import { phaseSuggestion, expansionReady } from '../phases';
import { DEFAULT_PROFILE, type FieldDefinition } from '../types';
import { entry, habit } from '../../test/fixtures';

const TODAY = '2026-11-17'; // Tuesday

describe('habitStats', () => {
  it('excludes skipped/paused/postponed and today-open from the rate; missing ≠ 0', () => {
    const h = habit({ startDate: '2026-11-10' });
    const e = [
      entry('2026-11-10'), entry('2026-11-11'), entry('2026-11-12', 'skipped'),
      entry('2026-11-13', 'paused'), entry('2026-11-14', 'postponed', { postponedTo: '2026-11-15' }),
      entry('2026-11-15'),
      // 16th: nothing documented
    ];
    const s = habitStats(h, e, '2026-11-10', '2026-11-20', TODAY);
    expect(s).toMatchObject({ planned: 8, done: 3, skipped: 1, paused: 1, postponed: 1, undocumented: 1, open: 1 });
    expect(s.rate).toBeCloseTo(3 / 4);
  });

  it('returns null rate when nothing can be evaluated', () => {
    const h = habit({ startDate: TODAY });
    expect(habitStats(h, [], TODAY, TODAY, TODAY).rate).toBeNull();
    expect(combineStats([]).rate).toBeNull();
  });

  it('respects weekdays, start date and pause periods', () => {
    const h = habit({
      scheduleType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-11-02',
      pausePeriods: [{ start: '2026-11-09', end: '2026-11-13' }],
    });
    // Mon 2,Wed 4,Fri 6 planned; 9-13 paused; Mon 16 planned
    const s = habitStats(h, [entry('2026-11-02'), entry('2026-11-04'), entry('2026-11-06'), entry('2026-11-16')], '2026-11-01', TODAY, TODAY);
    expect(s.planned).toBe(4);
    expect(s.rate).toBe(1);
  });

  it('counts done on unplanned days as extra, not in rate', () => {
    const h = habit({ scheduleType: 'weekdays', weekdays: [1], startDate: '2026-11-01' });
    const s = habitStats(h, [entry('2026-11-16'), entry('2026-11-15')], '2026-11-15', '2026-11-16', TODAY);
    expect(s).toMatchObject({ planned: 1, done: 1, extra: 1, rate: 1 });
  });

  it('handles x-per-week habits with prorated partial weeks', () => {
    const h = habit({ scheduleType: 'times_per_week', timesPerWeek: 3, startDate: '2026-11-02' });
    // week 2-8: 2 done of 3 (past → 1 undocumented); week 9-15: 4 done (1 extra); week 16-22 running
    const e = ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-16'].map((d) => entry(d));
    const s = habitStats(h, e, '2026-11-02', TODAY, TODAY);
    expect(s.done).toBe(2 + 3 + 1);
    expect(s.extra).toBe(1);
    expect(s.undocumented).toBe(1);
    expect(s.rate).toBeCloseTo(6 / 7, 5); // running week: done counts, open remainder excluded
  });
});

describe('streak', () => {
  it('ignores skipped days and today-open', () => {
    const h = habit({ startDate: '2026-11-10' });
    const e = [entry('2026-11-13'), entry('2026-11-14', 'skipped'), entry('2026-11-15'), entry('2026-11-16')];
    expect(currentStreak(h, e, TODAY)).toBe(3);
  });
});

describe('today items', () => {
  it('shows scheduled, postponed-in and flexible habits; open first', () => {
    const a = habit({ id: 'a', name: 'A', reminderTime: '07:00' });
    const b = habit({ id: 'b', name: 'B', scheduleType: 'weekdays', weekdays: [1] }); // not Tuesday
    const c = habit({ id: 'c', name: 'C', scheduleType: 'times_per_week', timesPerWeek: 2 });
    const d = habit({ id: 'd', name: 'D', status: 'paused', pausePeriods: [{ start: '2026-11-15', end: null }] });
    const e = [
      entry('2026-11-16', 'postponed', { habitId: 'b', postponedTo: TODAY }),
      entry(TODAY, 'done', { habitId: 'a' }),
    ];
    const items = itemsForDay([a, b, c, d], e, TODAY);
    expect(items.map((i) => [i.habit.id, i.kind])).toEqual([['b', 'postponed_in'], ['c', 'flexible'], ['a', 'scheduled']]);
    expect(nextItem(items, '08:00')?.habit.id).toBe('b');
  });

  it('hides flexible habits once the weekly target is met', () => {
    const c = habit({ id: 'c', scheduleType: 'times_per_week', timesPerWeek: 1 });
    expect(itemsForDay([c], [entry('2026-11-16', 'done', { habitId: 'c' })], TODAY)).toHaveLength(0);
  });

  it('reveals fields according to phase (Habit Depth)', () => {
    const f = (key: string, minPhase: 1 | 2 | 3): FieldDefinition => ({
      id: key, habitId: 'h1', key, label: key, type: 'number', unit: '', minPhase, sortOrder: 0, archived: false,
    });
    const fields = [f('a', 1), f('b', 2), f('c', 3)];
    expect(visibleFields(habit({ phase: 1 }), fields).map((x) => x.key)).toEqual(['a']);
    expect(visibleFields(habit({ phase: 3 }), fields).map((x) => x.key)).toEqual(['a', 'b', 'c']);
  });
});

describe('phase suggestion', () => {
  const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-11-${String(from + i).padStart(2, '0')}`);

  it('suggests next phase at the configurable threshold only with enough data', () => {
    const h = habit({ startDate: '2026-11-03' });
    const e = days(3, 16).filter((d) => d !== '2026-11-08' && d !== '2026-11-12').map((d) => entry(d)); // 12/14
    expect(phaseSuggestion(h, e, DEFAULT_PROFILE, TODAY)).toMatchObject({ from: 1, to: 2 });
    expect(phaseSuggestion(h, e, { ...DEFAULT_PROFILE, phaseThreshold: 0.9 }, TODAY)).toBeNull();
  });

  it('never suggests for too young habits, dismissed suggestions or phase 5', () => {
    const e = days(12, 16).map((d) => entry(d));
    expect(phaseSuggestion(habit({ startDate: '2026-11-12' }), e, DEFAULT_PROFILE, TODAY)).toBeNull();
    const full = days(1, 16).map((d) => entry(d));
    expect(phaseSuggestion(habit({ phaseSuggestionDismissedUntil: '2026-11-20' }), full, DEFAULT_PROFILE, TODAY)).toBeNull();
    expect(phaseSuggestion(habit({ phase: 5 }), full, DEFAULT_PROFILE, TODAY)).toBeNull();
  });

  it('expansion is ready only when all active habits are regular', () => {
    const full = days(1, 16).map((d) => entry(d));
    expect(expansionReady([habit()], full, DEFAULT_PROFILE, TODAY)).toBe(true);
    expect(expansionReady([habit(), habit({ id: 'h2' })], full, DEFAULT_PROFILE, TODAY)).toBe(false);
  });
});
