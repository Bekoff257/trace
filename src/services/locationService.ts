/**
 * Location Service — handles foreground and background GPS tracking.
 * The background task is defined at module level (required by TaskManager).
 * Import this file in app/_layout.tsx to register the task at startup.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';

// Background location on Android is not supported in Expo Go.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const supportsBackground = !(Platform.OS === 'android' && isExpoGo);
import { TRACKING } from '@constants/config';
import { insertLocationPoint, getPointsForDate } from './localDB';
import { processNewPoint } from './visitDetector';
import { publishLocation } from './friendLocationPublisher';
import { useLocationStore } from '@stores/locationStore';
import type { LocationPoint } from '@/types/index';

// ─── Persistence keys (survive app kill) ─────────────────────────────────────

const LS_USER_ID  = 'ls_uid';
const LS_LAST_POS = 'ls_last_pos';

function todayStr(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Persist filter state after every accepted point.
 * The background task loads this on startup after an app kill so the GPS
 * filter has a valid reference position instead of treating the first
 * post-kill point as a fresh baseline.
 */
function persistFilterState(lat: number, lng: number, time: number): void {
  AsyncStorage.setItem(LS_LAST_POS, JSON.stringify({ lat, lng, time })).catch(() => {});
}

/**
 * Load userId + filter state from AsyncStorage.
 * Must be awaited at the start of the background task handler — after an app
 * kill all module-level variables are reset to their default values.
 */
async function loadPersistedState(): Promise<void> {
  if (_currentUserId === 'anonymous') {
    const uid = await AsyncStorage.getItem(LS_USER_ID).catch(() => null);
    if (uid) _currentUserId = uid;
  }
  if (_lastRecordedLat === null) {
    try {
      const raw = await AsyncStorage.getItem(LS_LAST_POS);
      if (raw) {
        const { lat, lng, time } = JSON.parse(raw) as {
          lat: number; lng: number; time: number;
        };
        _lastRecordedLat  = lat;
        _lastRecordedLng  = lng;
        _lastAcceptedTime = time;
      }
    } catch {}
  }
}

/**
 * Re-read today's points from SQLite and push them into the location store.
 * Call this every time the app returns to the foreground so the path and
 * distance reflect any points recorded by the background task while backgrounded.
 */
export async function rehydrateFromDB(userId: string): Promise<void> {
  try {
    const points = await getPointsForDate(userId, todayStr());
    if (points.length > 0) {
      useLocationStore.getState().setPoints(points);
      // Seed filter state from the last DB point so foreground tracking
      // continues smoothly from where the background task left off.
      const last = points[points.length - 1];
      if (_lastRecordedLat === null) {
        _lastRecordedLat  = last.lat;
        _lastRecordedLng  = last.lng;
        _lastAcceptedTime = new Date(last.recordedAt).getTime();
      }
    }
  } catch {}
}

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

    // Restore userId + filter state that were wiped by an app kill.
    // This is a no-op when the app is merely backgrounded (state still in memory).
    await loadPersistedState();

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

      // Persist filter state so the next background task invocation (or a
      // foreground restart) has a valid reference position.
      persistFilterState(lat, lng, loc.timestamp);

      // Update UI if the app is in the foreground (addPoint is a no-op in a
      // separate killed-app JS context but harmless to call).
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
  AsyncStorage.setItem(LS_USER_ID, userId).catch(() => {});
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

/**
 * Restart only the foreground subscription — leaves the background task running.
 * Call this whenever the app returns to the foreground to recover from a dead
 * subscription (Android Doze / OS memory pressure can kill watchPositionAsync
 * silently while _locationSubscription remains non-null).
 */
export async function restartForegroundTracking(userId: string): Promise<void> {
  _currentUserId = userId;
  await stopForegroundTracking();   // nulls _locationSubscription + resets filter
  await startForegroundTracking();
}

export async function isTrackingActive(): Promise<boolean> {
  const hasTask = await TaskManager.isTaskRegisteredAsync(TRACKING.BACKGROUND_TASK_NAME);
  return hasTask || _locationSubscription !== null;
}

// ─── Shared point pipeline ────────────────────────────────────────────────────

/**
 * Runs a raw LocationObject through the full filter → smooth → persist pipeline.
 * Used by both the real foreground subscription and the dev mock emitter.
 */
async function processRawPoint(loc: Location.LocationObject): Promise<void> {
  try {
    const raw = locationObjectToPoint(loc, _currentUserId);
    if (!raw) return;

    const result = evaluatePoint(raw.lat, raw.lng, raw.accuracy, loc.timestamp);
    if (result === 'reject') return;
    _lastAcceptedTime = loc.timestamp;
    if (result === 'lock') return;

    const { lat, lng } = smoothAccepted(raw.lat, raw.lng);
    const point = { ...raw, lat, lng };
    _lastRecordedLat = lat;
    _lastRecordedLng = lng;
    persistFilterState(lat, lng, loc.timestamp);
    useLocationStore.getState().addPoint(point);
    publishLocation(point.lat, point.lng, point.speed, point.heading);
    insertLocationPoint(point).catch((e: any) =>
      console.warn('[LocationService] DB write skipped:', e?.message ?? e)
    );
    processNewPoint(point).catch((e: any) =>
      console.warn('[LocationService] Visit detection skipped:', e?.message ?? e)
    );
  } catch (e: any) {
    if (!e?.message?.includes('forEach')) console.warn('[LocationService] Point fault:', e);
  }
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
    (loc) => { processRawPoint(loc); }
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

// ─── Mock GPS (dev only) ──────────────────────────────────────────────────────
//
// Emits fake location points through the exact same filter → smooth → persist
// pipeline as real GPS. Use it to draw paths and test tracking without moving.
//
// Usage (in any dev screen):
//   import { startMockTracking, stopMockTracking, isMockTracking } from '@services/locationService';

/**
 * ~640 m rectangular walking loop around Tashkent city centre.
 * Each waypoint is ~20 m from the previous one (normal walking pace).
 * Extend or replace these with any coordinates you like.
 */
const MOCK_ROUTE: Array<{ lat: number; lng: number }> = [
  // North leg ↑
  { lat: 41.2990, lng: 69.2400 },
  { lat: 41.2992, lng: 69.2400 },
  { lat: 41.2994, lng: 69.2400 },
  { lat: 41.2996, lng: 69.2400 },
  { lat: 41.2998, lng: 69.2400 },
  { lat: 41.3000, lng: 69.2400 },
  { lat: 41.3002, lng: 69.2400 },
  { lat: 41.3004, lng: 69.2400 },
  // East leg →
  { lat: 41.3004, lng: 69.2402 },
  { lat: 41.3004, lng: 69.2405 },
  { lat: 41.3004, lng: 69.2407 },
  { lat: 41.3004, lng: 69.2409 },
  { lat: 41.3004, lng: 69.2412 },
  { lat: 41.3004, lng: 69.2414 },
  { lat: 41.3004, lng: 69.2416 },
  { lat: 41.3004, lng: 69.2419 },
  // South leg ↓
  { lat: 41.3002, lng: 69.2419 },
  { lat: 41.3000, lng: 69.2419 },
  { lat: 41.2998, lng: 69.2419 },
  { lat: 41.2996, lng: 69.2419 },
  { lat: 41.2994, lng: 69.2419 },
  { lat: 41.2992, lng: 69.2419 },
  { lat: 41.2990, lng: 69.2419 },
  // West leg ←
  { lat: 41.2990, lng: 69.2417 },
  { lat: 41.2990, lng: 69.2414 },
  { lat: 41.2990, lng: 69.2412 },
  { lat: 41.2990, lng: 69.2409 },
  { lat: 41.2990, lng: 69.2407 },
  { lat: 41.2990, lng: 69.2405 },
  { lat: 41.2990, lng: 69.2402 },
];

const MOCK_INTERVAL_MS = 3000; // one point every 3 s (clears the 2.5 s throttle)

let _mockInterval: ReturnType<typeof setInterval> | null = null;
let _mockRouteIndex = 0;

export function isMockTracking(): boolean {
  return _mockInterval !== null;
}

export function startMockTracking(userId: string): void {
  if (!__DEV__) return;
  if (_mockInterval) return;

  _currentUserId = userId;
  _mockRouteIndex = 0;
  resetFilterState();

  console.log('[MockGPS] Started — looping', MOCK_ROUTE.length, 'waypoints at', MOCK_INTERVAL_MS, 'ms each');

  _mockInterval = setInterval(() => {
    const { lat, lng } = MOCK_ROUTE[_mockRouteIndex % MOCK_ROUTE.length];
    _mockRouteIndex++;

    const fakeLoc: Location.LocationObject = {
      coords: {
        latitude: lat,
        longitude: lng,
        accuracy: 5,          // well within the 20 m accuracy gate
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
      mocked: true,
    };

    processRawPoint(fakeLoc);
  }, MOCK_INTERVAL_MS);
}

export function stopMockTracking(): void {
  if (_mockInterval) {
    clearInterval(_mockInterval);
    _mockInterval = null;
    resetFilterState();
    useLocationStore.getState().setPoints([]);
    console.log('[MockGPS] Stopped — location store cleared');
  }
}
