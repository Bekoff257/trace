/**
 * Notification Service — registers for Expo push tokens, saves to Supabase,
 * and handles foreground notification display + tap routing.
 *
 * Token storage: written to both `users.push_token` and `user_profiles.push_token`
 * so whichever table the backend reads the token is always present.
 *
 * DeviceNotRegistered handling: if the Expo Push API reports that a token is no
 * longer valid, the token is automatically cleared from the database so the next
 * send attempt doesn't waste a round-trip on a dead token. The recipient's device
 * will re-register a fresh token the next time the app is opened.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabaseClient';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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
    if (!token) return;

    // Write to both tables so the token is always findable regardless of
    // which table the push-send code queries
    await Promise.allSettled([
      supabase
        .from('users')
        .update({ push_token: token })
        .eq('id', userId),
      supabase
        .from('user_profiles')
        .upsert(
          { user_id: userId, push_token: token, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        ),
    ]);
  } catch {
    // Firebase / Expo Push not configured — push notifications unavailable on this build
  }
}

// ─── Send push notification ───────────────────────────────────────────────────

/**
 * Sends a push notification via Expo Push API and handles errors gracefully.
 *
 * On DeviceNotRegistered the stale token is cleared from the database so future
 * sends don't waste requests. The recipient will re-register on next app open.
 */
export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  recipientUserId?: string,
): Promise<void> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
    });

    if (!res.ok) return;

    const json = await res.json();
    // Expo returns { data: { status, details } } for single sends
    const result = json?.data;

    if (
      result?.status === 'error' &&
      result?.details?.error === 'DeviceNotRegistered' &&
      recipientUserId
    ) {
      // Token is revoked (device uninstalled or reinstalled the app).
      // Remove from DB — recipient will re-register fresh token on next launch.
      await clearPushToken(recipientUserId);
    }
  } catch {
    // Non-critical — never crash tracking or social features on push failure
  }
}

async function clearPushToken(userId: string): Promise<void> {
  await Promise.allSettled([
    supabase.from('users').update({ push_token: null }).eq('id', userId),
    supabase.from('user_profiles').update({ push_token: null }).eq('user_id', userId),
  ]);
}

// ─── Push token lookup (used by friendsStore) ─────────────────────────────────

/**
 * Looks up a user's Expo push token. Checks user_profiles first (most
 * up-to-date), falls back to users table.
 */
export async function getPushToken(userId: string): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('push_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (profile?.push_token) return profile.push_token;

    const { data: user } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', userId)
      .maybeSingle();
    return user?.push_token ?? null;
  } catch {
    return null;
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
