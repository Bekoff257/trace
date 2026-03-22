/**
 * Notification Service — registers for Expo push tokens, saves to Supabase,
 * and handles foreground notification display + tap routing.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabaseClient';

// Show notifications even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Register ─────────────────────────────────────────────────────────────────

export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5B7FFF',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;

    if (existing !== 'granted') {
      const { status: requested } = await Notifications.requestPermissionsAsync();
      status = requested;
    }

    if (status !== 'granted') return;

    const { data: token } = await Notifications.getExpoPushTokenAsync();

    await supabase
      .from('users')
      .update({ push_token: token })
      .eq('id', userId);
  } catch {
    // Firebase not configured — push notifications unavailable on this build
  }
}

// ─── Tap handler ──────────────────────────────────────────────────────────────

export function setupNotificationTapHandler(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, any>;
    if (!data) return;

    switch (data.type) {
      case 'low_battery':
      case 'friend_offline':
        router.push('/friends');
        break;
      case 'friend_request':
      case 'friend_accepted':
        router.push('/friends');
        break;
    }
  });

  return () => sub.remove();
}

// ─── Local notification (for foreground realtime events) ──────────────────────

export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: data ?? {}, sound: true },
      trigger: null, // fire immediately
    });
  } catch {
    // ignore if permissions not granted
  }
}
