/**
 * Location Service — handles foreground and background GPS tracking.
 * The background task is defined at module level (required by TaskManager).
 * Import this file in app/_layout.tsx to register the task at startup.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import 'react-native-get-random-values';

// Background location on Android is not supported in Expo Go.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const supportsBackground = !(Platform.OS === 'android' && isExpoGo);
import { TRACKING } from '@constants/config';
import { insertLocationPoint } from './localDB';
import { processNewPoint } from './visitDetector';
import { publishLocation } from './friendLocationPublisher';
import { useLocationStore } from '@stores/locationStore';
import type { LocationPoint } from '@/types/index';

// ─── Background Task ──────────────────────────────────────────────────────────
// Must be defined at module level — NOT inside a function or component.

TaskManager.defineTask(TRACKING.BACKGROUND_TASK_NAME, async ({ data, error }: any) => {
  try {
    if (error) {
      console.warn('[LocationService] Background task error:', error.message);
      return;
    }

    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations?.length) return;

    for (const loc of locations) {
      const point = locationObjectToPoint(loc, _currentUserId);
      if (!point) continue;
      try {
        await insertLocationPoint(point);
        await processNewPoint(point);
        useLocationStore.getState().addPoint(point);
        publishLocation(point.lat, point.lng, point.speed, point.heading);
      } catch (dbErr: any) {
        console.warn('[LocationService] Background DB write skipped:', dbErr?.message ?? dbErr);
      }
    }
  } catch (e: any) {
    // Swallow EventEmitter forEach errors from expo-location's internal emitter
    // on New Architecture — these don't affect tracking functionality.
    if (!e?.message?.includes('forEach')) console.warn('[LocationService] BG task fault:', e);
  }
});

// ─── State ────────────────────────────────────────────────────────────────────

let _currentUserId = 'anonymous';
let _locationSubscription: Location.LocationSubscription | null = null;

export function setTrackingUserId(userId: string): void {
  _currentUserId = userId;
}

// Unregister the background task if the environment doesn't support it.
// Call this once at app startup to clear any stale registration.
export async function cleanupUnsupportedBackgroundTask(): Promise<void> {
  if (supportsBackground) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TRACKING.BACKGROUND_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(TRACKING.BACKGROUND_TASK_NAME);
    }
  } catch {
    // Task already unregistered or never existed — nothing to do.
  }
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return { foreground: false, background: false };

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg === 'granted' };
}

export async function checkPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const { status: fg } = await Location.getForegroundPermissionsAsync();
  const { status: bg } = await Location.getBackgroundPermissionsAsync();
  return { foreground: fg === 'granted', background: bg === 'granted' };
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

export async function startTracking(userId: string): Promise<boolean> {
  _currentUserId = userId;

  const perms = await checkPermissions();
  if (!perms.foreground) {
    const requested = await requestPermissions();
    if (!requested.foreground) return false;
  }

  // Start foreground subscription (always active when app is open)
  await startForegroundTracking();

  // Start background task if permission granted and environment supports it
  if (supportsBackground) {
    const { background } = await checkPermissions();
    if (background) {
      await startBackgroundTracking();
    }
  }

  return true;
}

export async function stopTracking(): Promise<void> {
  await stopForegroundTracking();
  await stopBackgroundTracking();
}

export async function restartTracking(userId: string): Promise<void> {
  await stopTracking();
  await startTracking(userId);
}

export async function isTrackingActive(): Promise<boolean> {
  const hasTask = await TaskManager.isTaskRegisteredAsync(TRACKING.BACKGROUND_TASK_NAME);
  return hasTask || _locationSubscription !== null;
}

// ─── Foreground tracking ──────────────────────────────────────────────────────

function getTrackingParams() {
  const mode = useLocationStore.getState().mode;
  const isLowPower = mode === 'low_power';
  return {
    accuracy: isLowPower ? Location.Accuracy.Low : Location.Accuracy.Balanced,
    distanceInterval: isLowPower ? TRACKING.LOW_POWER_MIN_DISTANCE_M : TRACKING.MEDIUM_MIN_DISTANCE_M,
    timeInterval: isLowPower ? TRACKING.LOW_POWER_INTERVAL_MS : TRACKING.MEDIUM_INTERVAL_MS,
  };
}

async function startForegroundTracking(): Promise<void> {
  if (_locationSubscription) return; // already running

  _locationSubscription = await Location.watchPositionAsync(
    getTrackingParams(),
    async (loc) => {
      try {
        const point = locationObjectToPoint(loc, _currentUserId);
        if (!point) return;
        await insertLocationPoint(point);
        await processNewPoint(point);
        useLocationStore.getState().addPoint(point);
        publishLocation(point.lat, point.lng, point.speed, point.heading);
      } catch (e: any) {
        if (!e?.message?.includes('forEach')) console.warn('[LocationService] Foreground fault:', e);
      }
    }
  );
}

async function stopForegroundTracking(): Promise<void> {
  _locationSubscription?.remove();
  _locationSubscription = null;
}

// ─── Background tracking ──────────────────────────────────────────────────────

async function startBackgroundTracking(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(TRACKING.BACKGROUND_TASK_NAME);
  if (isRegistered) return;

  await Location.startLocationUpdatesAsync(TRACKING.BACKGROUND_TASK_NAME, {
    ...getTrackingParams(),
    // Android: keep service alive in notification
    foregroundService: Platform.OS === 'android'
      ? {
          notificationTitle: 'Location Tracking Active',
          notificationBody: 'Building your daily timeline…',
          notificationColor: '#4F6EF7',
        }
      : undefined,
    // iOS: pause detection & significant change
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Other,
  });
}

async function stopBackgroundTracking(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(TRACKING.BACKGROUND_TASK_NAME);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(TRACKING.BACKGROUND_TASK_NAME);
  }
}

// ─── Current location (one-shot) ──────────────────────────────────────────────

export async function getCurrentLocation(): Promise<LocationPoint | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return locationObjectToPoint(loc, _currentUserId);
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function locationObjectToPoint(
  loc: Location.LocationObject,
  userId: string
): LocationPoint | null {
  if (!loc?.coords) return null;
  return {
    id: `${userId}_${loc.timestamp}`,
    userId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 0,
    speed: Math.max(0, loc.coords.speed ?? 0),
    altitude: loc.coords.altitude ?? undefined,
    heading: loc.coords.heading ?? undefined,
    recordedAt: new Date(loc.timestamp).toISOString(),
    createdAt: new Date().toISOString(),
  };
}
