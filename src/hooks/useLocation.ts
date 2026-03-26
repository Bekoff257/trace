/**
 * useLocation — manages tracking lifecycle tied to the auth session.
 * Call once in the root layout after auth is confirmed.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '@stores/authStore';
import { useLocationStore } from '@stores/locationStore';
import {
  startTracking,
  stopTracking,
  setTrackingUserId,
} from '@services/locationService';
import { setDetectorUserId } from '@services/visitDetector';
import { startAutoSync, stopAutoSync, runSync } from '@services/syncService';

export function useLocation(): void {
  const { session, user } = useAuthStore();
  const { setTracking, setBackground } = useLocationStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!session || !user) {
      stopTracking();
      stopAutoSync();
      setTracking(false);
      setBackground(false);
      return;
    }

    const userId = user.id;
    setTrackingUserId(userId);
    setDetectorUserId(userId);

    startTracking(userId).then((started) => {
      setTracking(started);
    });

    startAutoSync(userId);

    // Handle app foreground/background transitions
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      const goingBackground = next === 'background';
      const comingForeground = prev.match(/inactive|background/) && next === 'active';

      setBackground(goingBackground);

      if (comingForeground) {
        runSync(userId).catch(console.error);
      }
    });

    return () => {
      stopAutoSync();
      sub.remove();
    };
  }, [session?.access_token, user?.id]);
}
