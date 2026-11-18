import { fireDate, isInSleepWindow, logicalDate, planReminders, resolveReminder, RHYTHM_PRESETS, SHIFT_PRESETS } from '../rhythm';
import { DEFAULT_PROFILE, type DaySchedule, type Profile } from '../types';
import { habit } from '../../test/fixtures';

const night: Profile = { ...DEFAULT_PROFILE, dayRhythm: 'night', ...RHYTHM_PRESETS.night };
const standard: Profile = { ...DEFAULT_PROFILE };

describe('rhythm & shift work', () => {
  it('detects sleep windows, also across midnight', () => {
    expect(isInSleepWindow('02:00', standard.anchors)).toBe(true);
    expect(isInSleepWindow('07:00', standard.anchors)).toBe(false);
    expect(isInSleepWindow('10:00', night.anchors)).toBe(true); // night shift sleeps 08–14
    expect(isInSleepWindow('20:00', night.anchors)).toBe(false);
  });

  it('logical day starts at dayStartHour (night shift: 05:00 still belongs to yesterday)', () => {
    expect(logicalDate(new Date(2026, 10, 18, 5, 0), night.dayStartHour)).toBe('2026-11-17');
    expect(logicalDate(new Date(2026, 10, 18, 13, 0), night.dayStartHour)).toBe('2026-11-18');
    expect(logicalDate(new Date(2026, 10, 18, 2, 0), standard.dayStartHour)).toBe('2026-11-17');
  });

  it('night shift gets no unsuitable fixed default reminders', () => {
    const h = habit({ reminderEnabled: true, reminderTime: '10:00' });
    expect(resolveReminder(h, '2026-11-18', standard, [])).toEqual({ time: '10:00', skipped: false });
    expect(resolveReminder(h, '2026-11-18', night, [])).toEqual({ time: null, skipped: true, reason: 'sleep_window' });
  });

  it('relative reminders follow the anchors of the day', () => {
    const h = habit({ reminderEnabled: true, reminderTime: null, reminderAnchor: 'wake', reminderOffsetMin: 30 });
    expect(resolveReminder(h, '2026-11-18', standard, [])).toEqual({ time: '07:30', skipped: false });
    expect(resolveReminder(h, '2026-11-18', night, [])).toEqual({ time: '14:30', skipped: false });
  });

  it('rotating shifts: per-day overrides win; "after work" is skipped on days off', () => {
    const rotating: Profile = { ...DEFAULT_PROFILE, dayRhythm: 'rotating' };
    const sched = (localDate: string, shift: DaySchedule['shift']): DaySchedule => ({
      id: localDate, localDate, shift, anchors: SHIFT_PRESETS[shift as 'early'], createdAt: '', updatedAt: '',
    });
    const schedules = [sched('2026-11-18', 'early'), sched('2026-11-19', 'late'), sched('2026-11-20', 'off')];
    const h = habit({ reminderEnabled: true, reminderAnchor: 'work_end', reminderOffsetMin: 15 });
    expect(resolveReminder(h, '2026-11-18', rotating, schedules)).toMatchObject({ time: '14:15' });
    expect(resolveReminder(h, '2026-11-19', rotating, schedules)).toMatchObject({ time: '22:45' });
    expect(resolveReminder(h, '2026-11-20', rotating, schedules)).toMatchObject({ skipped: true, reason: 'no_work' });
  });

  it('bedtime after midnight fires on the next calendar day', () => {
    const late: Profile = { ...DEFAULT_PROFILE, ...RHYTHM_PRESETS.late };
    const h = habit({ reminderEnabled: true, reminderAnchor: 'bedtime', reminderOffsetMin: -30 });
    expect(resolveReminder(h, '2026-11-18', late, [])).toMatchObject({ time: '00:30' });
    expect(fireDate('2026-11-18', '00:30', late.dayStartHour)).toBe('2026-11-19');
  });

  it('plans reminders only for due days and skips disabled ones', () => {
    const a = habit({ id: 'a', reminderEnabled: true, reminderTime: '18:00', scheduleType: 'weekdays', weekdays: [3] }); // Wed
    const b = habit({ id: 'b', reminderEnabled: false, reminderTime: '09:00' });
    const plan = planReminders([a, b], standard, [], '2026-11-16', 7);
    expect(plan).toEqual([{ habitId: 'a', date: '2026-11-18', fireOn: '2026-11-18', time: '18:00' }]);
  });
});
