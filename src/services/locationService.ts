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
      const raw = locationObjectToPoint(loc, _currentUserId);
      if (!raw) continue;

      // Step 1: Filter (no smoothing yet)
      const result = evaluatePoint(raw.lat, raw.lng, raw.accuracy, loc.timestamp);
      if (result === 'reject') continue;
      // Always advance the throttle clock so subsequent points are evaluated
      _lastAcceptedTime = loc.timestamp;
      if (result === 'lock') continue; // stationary — keep marker at last position

      // Step 2: Smooth only accepted points
      const { lat, lng } = smoothAccepted(raw.lat, raw.lng);
      const point = { ...raw, lat, lng };
      _lastRecordedLat = lat;
      _lastRecordedLng = lng;
      // Update UI immediately — do not wait on DB writes
      useLocationStore.getState().addPoint(point);
      publishLocation(point.lat, point.lng, point.speed, point.heading);
      // Fire-and-forget persistence
      insertLocationPoint(point).catch((e: any) =>
        console.warn('[LocationService] Background DB write skipped:', e?.message ?? e)
      );
      processNewPoint(point).catch((e: any) =>
        console.warn('[LocationService] Background visit detection skipped:', e?.message ?? e)
      );
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
let _lastRecordedLat: number | null = null;
let _lastRecordedLng: number | null = null;
let _lastAcceptedTime: number | null = null;
let _stationaryCount = 0;
// Explicit tracking state — drives soft-unlock threshold and UI stability
type TrackingState = 'moving' | 'stationary';
let _trackingState: TrackingState = 'moving';
// Rolling buffer of ACCEPTED points only — never contains locked/rejected readings
const _acceptedBuffer: Array<{ lat: number; lng: number }> = [];

// ─── GPS Filtering ────────────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type FilterResult = 'accept' | 'lock' | 'reject';

/**
 * Production-grade GPS state machine filter.
 *
 * Pipeline order: RAW → evaluatePoint() → smoothAccepted() → save
 * (smoothing only runs on 'accept', never on 'lock' or 'reject')
 *
 * State machine:
 *
 *   'moving' state
 *     dist < FREEZE_RADIUS_M (5m)   → lock, count++; if count ≥ 3 → 'stationary'
 *     dist < MIN_DISTANCE_M (10m)   → count++; if count ≥ 3 → lock + 'stationary', else accept
 *     dist ≥ MIN_DISTANCE_M         → accept, reset count
 *
 *   'stationary' state
 *     dist < UNLOCK_DISTANCE_M (15m) → lock (soft unlock: require stronger movement)
 *     dist ≥ UNLOCK_DISTANCE_M       → seed buffer, transition to 'moving', accept
 *
 * Hard quality gates (always applied first, no state change):
 *   accuracy > 20m  → reject
 *   throttle < 2.5s → reject
 *   dist > 100m     → reject (GPS glitch)
 *
 * Speed (coords.speed) is intentionally NOT used — unreliable/null on Android.
 */
function evaluatePoint(
  lat: number,
  lng: number,
  accuracy: number,
  timestamp: number,
): FilterResult {
  // ── Phase 1: Hard quality gates (no state mutation) ───────────────────────
  if (accuracy > TRACKING.ACCURACY_THRESHOLD_M) return 'reject';
  if (_lastAcceptedTime !== null && timestamp - _lastAcceptedTime < TRACKING.THROTTLE_MS) {
    return 'reject';
  }

  // ── Phase 2: First point ever — accept to establish baseline ─────────────
  if (_lastRecordedLat === null || _lastRecordedLng === null) return 'accept';

  const dist = haversineMeters(_lastRecordedLat, _lastRecordedLng, lat, lng);

  // GPS glitch — reject implausibly large jumps
  if (dist > TRACKING.MAX_JUMP_M) return 'reject';

  // ── Phase 3: State machine ────────────────────────────────────────────────

  if (_trackingState === 'stationary') {
    // Soft unlock: require UNLOCK_DISTANCE_M to exit stationary state.
    // This prevents walking-start jitter (< 15 m movements while waking up GPS).
    if (dist < TRACKING.UNLOCK_DISTANCE_M) return 'lock';

    // User has genuinely moved — transition to moving.
    // Seed smooth buffer with locked position so first step blends in smoothly
    // instead of snapping from old position to new one.
    _trackingState = 'moving';
    _stationaryCount = 0;
    seedSmoothBuffer(_lastRecordedLat, _lastRecordedLng);
    return 'accept';
  }

  // _trackingState === 'moving'

  // Hard freeze: micro-movement under 5 m — lock and count toward stationary
  if (dist < TRACKING.FREEZE_RADIUS_M) {
    _stationaryCount++;
    if (_stationaryCount >= TRACKING.STATIONARY_LOCK_COUNT) _trackingState = 'stationary';
    return 'lock';
  }

  // Stationary zone: small movement under 10 m
  if (dist < TRACKING.MIN_DISTANCE_M) {
    _stationaryCount++;
    if (_stationaryCount >= TRACKING.STATIONARY_LOCK_COUNT) {
      _trackingState = 'stationary';
      return 'lock';
    }
    // Count not yet reached — allow point through (movement is ambiguous)
    return 'accept';
  }

  // Clear movement — reset stationary counter
  _stationaryCount = 0;
  return 'accept';
}

/**
 * Pre-fills the smooth buffer with the locked position before the first
 * accepted point after a stationary→moving transition.
 * This blends the new position gradually from the lock point instead of
 * snapping the marker instantly across the gap.
 */
function seedSmoothBuffer(lat: number, lng: number): void {
  _acceptedBuffer.length = 0;
  for (let i = 0; i < TRACKING.SMOOTH_BUFFER_SIZE - 1; i++) {
    _acceptedBuffer.push({ lat, lng });
  }
}

/**
 * Exponentially weighted average of the last SMOOTH_BUFFER_SIZE accepted points.
 * Newest point carries the highest weight, so the path follows real movement
 * closely while still suppressing single-sample jitter.
 *
 * Weight progression (buffer size 3): index 0 = 1×, 1 = 2×, 2 = 4×
 * → newest point drives ~57% of the output position.
 *
 * Only ever called with accepted points — locked/rejected readings are never
 * added to this buffer.
 */
function smoothAccepted(lat: number, lng: number): { lat: number; lng: number } {
  _acceptedBuffer.push({ lat, lng });
  if (_acceptedBuffer.length > TRACKING.SMOOTH_BUFFER_SIZE) _acceptedBuffer.shift();
  if (_acceptedBuffer.length < 2) return { lat, lng };

  let totalWeight = 0;
  let sumLat = 0;
  let sumLng = 0;
  for (let i = 0; i < _acceptedBuffer.length; i++) {
    const w = Math.pow(2, i); // 1, 2, 4 — oldest to newest
    sumLat += _acceptedBuffer[i].lat * w;
    sumLng += _acceptedBuffer[i].lng * w;
    totalWeight += w;
  }
  return { lat: sumLat / totalWeight, lng: sumLng / totalWeight };
}

function resetFilterState(): void {
  _lastRecordedLat = null;
  _lastRecordedLng = null;
  _lastAcceptedTime = null;
  _stationaryCount = 0;
  _trackingState = 'moving';
  _acceptedBuffer.length = 0;
}

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
    // Highest accuracy in normal mode for clean GPS fix; Low for battery saver
    accuracy: isLowPower ? Location.Accuracy.Low : Location.Accuracy.Highest,
    // Small distanceInterval so the OS delivers points frequently — our own
    // shouldAcceptPoint filter is the real gatekeeper, not the OS threshold.
    distanceInterval: isLowPower ? TRACKING.LOW_POWER_MIN_DISTANCE_M : 5,
    timeInterval: isLowPower ? TRACKING.LOW_POWER_INTERVAL_MS : TRACKING.THROTTLE_MS,
  };
}

async function startForegroundTracking(): Promise<void> {
  if (_locationSubscription) return; // already running

  _locationSubscription = await Location.watchPositionAsync(
    getTrackingParams(),
    async (loc) => {
      try {
        const raw = locationObjectToPoint(loc, _currentUserId);
        if (!raw) return;

        // Step 1: Filter (no smoothing yet)
        const result = evaluatePoint(raw.lat, raw.lng, raw.accuracy, loc.timestamp);
        if (result === 'reject') return;
        // Always advance the throttle clock so subsequent points are evaluated
        _lastAcceptedTime = loc.timestamp;
        if (result === 'lock') return; // stationary — keep marker at last position

        // Step 2: Smooth only accepted points
        const { lat, lng } = smoothAccepted(raw.lat, raw.lng);
        const point = { ...raw, lat, lng };
        _lastRecordedLat = lat;
        _lastRecordedLng = lng;
        // Update UI immediately — do not wait on DB writes
        useLocationStore.getState().addPoint(point);
        publishLocation(point.lat, point.lng, point.speed, point.heading);
        // Fire-and-forget persistence
        insertLocationPoint(point).catch((e: any) =>
          console.warn('[LocationService] Foreground DB write skipped:', e?.message ?? e)
        );
        processNewPoint(point).catch((e: any) =>
          console.warn('[LocationService] Foreground visit detection skipped:', e?.message ?? e)
        );
      } catch (e: any) {
        if (!e?.message?.includes('forEach')) console.warn('[LocationService] Foreground fault:', e);
      }
    }
  );
}

async function stopForegroundTracking(): Promise<void> {
  _locationSubscription?.remove();
  _locationSubscription = null;
  resetFilterState();
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

/**
 * Compute speed in m/s from the distance between the last recorded position
 * and the new position, divided by the elapsed time.
 * More reliable than loc.coords.speed which is often null or inaccurate on Android.
 */
function computeSpeed(
  newLat: number,
  newLng: number,
  newTimestamp: number,
): number {
  if (_lastRecordedLat === null || _lastRecordedLng === null || _lastAcceptedTime === null) {
    return 0;
  }
  const dist = haversineMeters(_lastRecordedLat, _lastRecordedLng, newLat, newLng);
  const dtSeconds = (newTimestamp - _lastAcceptedTime) / 1000;
  if (dtSeconds <= 0 || dist <= 0) return 0;
  return dist / dtSeconds;
}

function locationObjectToPoint(
  loc: Location.LocationObject,
  userId: string
): LocationPoint | null {
  if (!loc?.coords) return null;
  const speed = computeSpeed(loc.coords.latitude, loc.coords.longitude, loc.timestamp);
  return {
    id: `${userId}_${loc.timestamp}`,
    userId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? 0,
    speed,
    altitude: loc.coords.altitude ?? undefined,
    heading: loc.coords.heading ?? undefined,
    recordedAt: new Date(loc.timestamp).toISOString(),
    createdAt: new Date().toISOString(),
  };
}
