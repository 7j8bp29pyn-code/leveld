import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { parseTime } from '../domain/dates';
import { planReminders } from '../domain/rhythm';
import type { DaySchedule, Habit, LocalDate, Profile } from '../domain/types';

/**
 * Local reminders for habits. Each reminder carries a deep link (`url`) to the
 * habit's entry screen. Not available on web – the UI states this explicitly.
 */
const MAX_SCHEDULED = 60;

export const notificationsSupported = Platform.OS !== 'web';

export type PermissionState = 'unsupported' | 'granted' | 'denied' | 'undetermined';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
    }),
  });
}

export async function getPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  const s = await Notifications.getPermissionsAsync();
  return s.granted ? 'granted' : s.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  const s = await Notifications.requestPermissionsAsync();
  return s.granted ? 'granted' : 'denied';
}

/** Days ahead that are planned as one-shot reminders; re-planned whenever the app is opened. */
export const PLAN_DAYS = 10;

/**
 * Re-schedules all habit reminders (idempotent: cancels ours first).
 * Reminders are planned per day from the user's rhythm / shift plan, so relative
 * reminders ("after waking") work and fixed times inside the sleep window are skipped.
 * Returns the number of scheduled notifications.
 */
export async function syncReminders(
  habits: Habit[], profile: Profile, schedules: DaySchedule[], today: LocalDate,
  title: (h: Habit) => string, body: (h: Habit) => string,
): Promise<number> {
  if (!notificationsSupported) return 0;
  const wanted = habits.some((h) => h.status === 'active' && h.reminderEnabled && (h.reminderTime || h.reminderAnchor));
  let perm = await getPermission();
  // ask once, at the moment the user actually sets up a reminder
  if (perm === 'undetermined' && wanted) perm = await requestPermission();
  if (perm !== 'granted') return 0;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.content.data?.source === 'leveld-habit').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('habits', {
      name: 'Gewohnheiten',
      // eslint-disable-next-line import/namespace -- re-exported via `export *`, false positive
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const now = Date.now();
  const plan = planReminders(habits, profile, schedules, today, PLAN_DAYS)
    .map((p) => {
      const [y, m, d] = p.fireOn.split('-').map(Number);
      const { hour, minute } = parseTime(p.time);
      return { ...p, at: new Date(y, m - 1, d, hour, minute) };
    })
    .filter((p) => p.at.getTime() > now)
    .slice(0, MAX_SCHEDULED); // iOS keeps at most 64 pending local notifications
  for (const p of plan) {
    const h = habits.find((x) => x.id === p.habitId)!;
    await Notifications.scheduleNotificationAsync({
      content: { title: title(h), body: body(h), sound: true, data: { source: 'leveld-habit', url: `/log?habitId=${h.id}&date=${p.date}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: 'habits' },
    });
  }
  return plan.length;
}
