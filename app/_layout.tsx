// Must import locationService at startup to register the background task
import '@services/locationService';
import { cleanupUnsupportedBackgroundTask } from '@services/locationService';

import MapLibreGL from '@maplibre/maplibre-react-native';
MapLibreGL.setAccessToken(null);

import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import { useLocation } from '@hooks/useLocation';
import { COLORS } from '@constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 1000 * 60 * 5 },
  },
});

// Starts/stops GPS tracking whenever the auth session changes
function LocationManager() {
  useLocation();
  return null;
}

function AuthGate() {
  const { session, isLoading, initialize } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/onboarding');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, isLoading, segments]);

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
  useEffect(() => {
    cleanupUnsupportedBackgroundTask();
  }, []);

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
            <Stack.Screen name="insights" options={{ presentation: 'card', animation: 'slide_from_right' }} />
            <Stack.Screen name="privacy" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          </Stack>
          <AuthGate />
          <LocationManager />
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
