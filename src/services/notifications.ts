import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { parseTime } from '../domain/dates';
import type { Habit } from '../domain/types';

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

/** Our ISO weekday (1=Mon) → expo weekday (1=Sun). */
export const toExpoWeekday = (iso: number) => (iso % 7) + 1;

/**
 * Re-schedules all habit reminders (idempotent: cancels ours first).
 * Returns the number of scheduled notifications.
 */
export async function syncReminders(habits: Habit[], title: (h: Habit) => string, body: (h: Habit) => string): Promise<number> {
  if (!notificationsSupported) return 0;
  const wanted = habits.some((h) => h.status === 'active' && h.reminderEnabled && h.reminderTime);
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
  let count = 0;
  for (const h of habits) {
    if (h.status !== 'active' || !h.reminderEnabled || !h.reminderTime) continue;
    if (count >= MAX_SCHEDULED) break; // iOS keeps at most 64 pending local notifications
    const { hour, minute } = parseTime(h.reminderTime);
    const content = { title: title(h), body: body(h), sound: true, data: { source: 'leveld-habit', url: `/log?habitId=${h.id}` } };
    const days = h.scheduleType === 'weekdays' ? h.weekdays : [1, 2, 3, 4, 5, 6, 7];
    if (days.length === 7) {
      await Notifications.scheduleNotificationAsync({
        content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'habits' },
      });
      count++;
    } else {
      for (const d of days) {
        if (count >= MAX_SCHEDULED) break;
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(d), hour, minute, channelId: 'habits' },
        });
        count++;
      }
    }
  }
  return count;
}
