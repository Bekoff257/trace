// Must import locationService at startup to register the background task
import '@services/locationService';
import { cleanupUnsupportedBackgroundTask } from '@services/locationService';
import { initI18n } from '@i18n/index';

// MapLibre v11 does not require setAccessToken for open tile servers

import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '@services/supabaseClient';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import { useLocationStore } from '@stores/locationStore';
import { useLocation } from '@hooks/useLocation';
import { COLORS } from '@constants/theme';
import { registerForPushNotifications, setupNotificationTapHandler } from '@services/notificationService';
import { openUserDB, getPointsForDate } from '@services/localDB';
import { todayDateString } from '@services/summaryService';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
});

/**
 * Opens the per-user SQLite database as soon as a session is established,
 * and closes it on sign-out. Must render before HistoryHydrator.
 */
function DBManager() {
  const { session } = useAuthStore();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (userId) {
      openUserDB(userId).catch((e) =>
        console.warn('[DBManager] Failed to open user DB:', e)
      );
    }
    // closeUserDB is handled in authStore.signOut so the in-memory state
    // is cleared synchronously before the DB closes.
  }, [userId]);

  return null;
}

// Starts/stops GPS tracking whenever the auth session changes
function LocationManager() {
  useLocation();
  return null;
}

function NotificationManager() {
  const { session } = useAuthStore();

  useEffect(() => {
    if (!session?.user?.id) return;
    registerForPushNotifications(session.user.id);
    return setupNotificationTapHandler();
  }, [session?.user?.id]);

  return null;
}

function HistoryHydrator() {
  const { session } = useAuthStore();
  const { recentPoints, setPoints } = useLocationStore();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId || recentPoints.length > 0) return;
    getPointsForDate(userId, todayDateString())
      .then((pts) => { if (pts.length > 0) setPoints(pts); })
      .catch(() => {});
  }, [userId]);

  return null;
}

function AuthGate() {
  const { session, user, isLoading, initialize } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onUsernameScreen = inAuthGroup && segments[1] === 'username';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/onboarding');
    } else if (session && !user?.username && !onUsernameScreen) {
      router.replace('/(auth)/username');
    } else if (session && user?.username && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, user?.username, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    cleanupUnsupportedBackgroundTask();
    initI18n().finally(() => setI18nReady(true));

    // Handle OAuth deep link callback — fires when Android delivers the redirect
    // URL to the app directly (before openAuthSessionAsync can capture it)
    async function handleOAuthUrl(url: string) {
      if (!url.includes('auth/callback')) return;
      const hash = url.split('#')[1] ?? '';
      const query = url.split('?')[1] ?? '';
      const hp = new URLSearchParams(hash);
      const qp = new URLSearchParams(query);
      const accessToken = hp.get('access_token') ?? qp.get('access_token');
      const refreshToken = hp.get('refresh_token') ?? qp.get('refresh_token');
      const code = qp.get('code');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      } else if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
    }

    const sub = Linking.addEventListener('url', ({ url }) => handleOAuthUrl(url));
    Linking.getInitialURL().then((url) => { if (url) handleOAuthUrl(url); });

    return () => sub.remove();
  }, []);

  if (!i18nReady) {
    return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" backgroundColor={COLORS.background} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: COLORS.background },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="place/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="friends" options={{ presentation: 'card', animation: 'slide_from_right' }} />
            <Stack.Screen name="insights" options={{ presentation: 'card', animation: 'slide_from_right' }} />
            <Stack.Screen name="privacy" options={{ presentation: 'card', animation: 'slide_from_right' }} />
            <Stack.Screen name="replay" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          </Stack>
          <AuthGate />
          <DBManager />
          <LocationManager />
          <NotificationManager />
          <HistoryHydrator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
