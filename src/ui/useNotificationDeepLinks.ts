import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { notificationsSupported } from '../services/notifications';

/** Tapping a reminder opens the related habit entry directly. */
export function useNotificationDeepLinks(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !notificationsSupported) return;
    const open = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, [enabled]);
}
