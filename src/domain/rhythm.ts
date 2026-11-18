import { addDays, isTimeOfDay, toLocalDate } from './dates';
import { isEligibleOn, isScheduledOn } from './schedule';
import type { DayAnchors, DayRhythm, DaySchedule, Habit, LocalDate, Profile, ShiftType, TimeOfDay } from './types';

/**
 * Day rhythm & shift work.
 * - Every "logical day" starts at profile.dayStartHour, so a night-shift worker's
 *   sleep after midnight still belongs to the previous day.
 * - Reminders may be relative to anchors (wake, first meal, work end, bedtime).
 * - Fixed reminders inside the sleep window are skipped instead of waking the user.
 * These are organisational rules only – no sleep or health recommendations are derived.
 */

export const RHYTHM_PRESETS: Record<Exclude<DayRhythm, 'rotating' | 'custom'>, { anchors: DayAnchors; dayStartHour: number }> = {
  standard: { anchors: { wake: '07:00', firstMeal: '08:00', workEnd: '17:00', bedtime: '23:00' }, dayStartHour: 3 },
  early: { anchors: { wake: '04:30', firstMeal: '05:15', workEnd: '14:00', bedtime: '21:30' }, dayStartHour: 2 },
  late: { anchors: { wake: '09:30', firstMeal: '10:30', workEnd: '22:30', bedtime: '01:00' }, dayStartHour: 4 },
  night: { anchors: { wake: '14:00', firstMeal: '15:00', workEnd: '06:30', bedtime: '08:00' }, dayStartHour: 12 },
};

export const SHIFT_PRESETS: Record<Exclude<ShiftType, 'custom'>, DayAnchors> = {
  early: RHYTHM_PRESETS.early.anchors,
  late: RHYTHM_PRESETS.late.anchors,
  night: RHYTHM_PRESETS.night.anchors,
  off: { wake: '08:30', firstMeal: '09:30', workEnd: null, bedtime: '23:30' },
};

export const minutesOf = (t: TimeOfDay) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const timeOf = (min: number): TimeOfDay => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** The user's logical day for an instant, honouring a day start after midnight. */
export function logicalDate(now: Date, dayStartHour: number): LocalDate {
  const d = new Date(now.getTime());
  d.setHours(d.getHours() - dayStartHour);
  return toLocalDate(d);
}

export function anchorsFor(date: LocalDate, profile: Profile, schedules: DaySchedule[]): DayAnchors {
  return schedules.find((s) => s.localDate === date)?.anchors ?? profile.anchors;
}

/** Sleep window = bedtime → wake (may wrap midnight). */
export function isInSleepWindow(t: TimeOfDay, a: DayAnchors): boolean {
  const x = minutesOf(t);
  const bed = minutesOf(a.bedtime);
  const wake = minutesOf(a.wake);
  if (bed === wake) return false;
  return bed < wake ? x >= bed && x < wake : x >= bed || x < wake;
}

export type ReminderResolution =
  | { time: TimeOfDay; skipped: false }
  | { time: null; skipped: true; reason: 'sleep_window' | 'no_work' | 'invalid' };

/** Concrete reminder time for a habit on a logical day, or why it is skipped. */
export function resolveReminder(habit: Habit, date: LocalDate, profile: Profile, schedules: DaySchedule[]): ReminderResolution | null {
  if (!habit.reminderEnabled) return null;
  const a = anchorsFor(date, profile, schedules);
  if (habit.reminderAnchor) {
    const base = { wake: a.wake, first_meal: a.firstMeal, work_end: a.workEnd, bedtime: a.bedtime }[habit.reminderAnchor];
    if (!base) return { time: null, skipped: true, reason: 'no_work' }; // e.g. "after work" on a day off
    return { time: timeOf(minutesOf(base) + (habit.reminderOffsetMin ?? 0)), skipped: false };
  }
  if (!habit.reminderTime || !isTimeOfDay(habit.reminderTime)) return { time: null, skipped: true, reason: 'invalid' };
  if (isInSleepWindow(habit.reminderTime, a)) return { time: null, skipped: true, reason: 'sleep_window' };
  return { time: habit.reminderTime, skipped: false };
}

/** Times before the day start belong to the logical day but fire on the next calendar day. */
export function fireDate(date: LocalDate, time: TimeOfDay, dayStartHour: number): LocalDate {
  return minutesOf(time) < dayStartHour * 60 ? addDays(date, 1) : date;
}

export interface PlannedReminder {
  habitId: string;
  /** logical day the reminder belongs to */
  date: LocalDate;
  /** calendar day + time on which it fires */
  fireOn: LocalDate;
  time: TimeOfDay;
}

/** Plans one-shot reminders for the next `days` logical days (sorted by fire time). */
export function planReminders(habits: Habit[], profile: Profile, schedules: DaySchedule[], from: LocalDate, days: number): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    for (const h of habits) {
      if (h.status !== 'active') continue;
      const due = h.scheduleType === 'times_per_week' ? isEligibleOn(h, date) : isScheduledOn(h, date);
      if (!due) continue;
      const r = resolveReminder(h, date, profile, schedules);
      if (!r || r.skipped) continue;
      out.push({ habitId: h.id, date, fireOn: fireDate(date, r.time, profile.dayStartHour), time: r.time });
    }
  }
  return out.sort((x, y) => (x.fireOn + x.time).localeCompare(y.fireOn + y.time));
}
