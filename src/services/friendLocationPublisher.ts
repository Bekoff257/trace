/**
 * Friend Location Publisher
 * Upserts the current user's location + battery to friend_locations in Supabase.
 *
 * Throttle strategy (battery + bandwidth optimisation):
 *   - Minimum 15 s between any two publishes.
 *   - Skip if moved < 20 m since last publish AND < 30 s have passed.
 *   - Always publish after 30 s even if stationary (keeps "last seen" fresh).
 *
 * Result: ~2–4 publishes/min walking vs the previous 24/min (every 2.5 s).
 */
import * as Battery from 'expo-battery';
import { supabase } from './supabaseClient';
import type { MovementStatus } from '@/types/index';

// ─── Module state ─────────────────────────────────────────────────────────────

let _userId: string | null = null;
let _username: string | null = null;

let _batteryLevel: number | null = null;
let _isCharging = false;
let _batterySubscription: Battery.BatteryLevelSubscription | null = null;
let _chargingSubscription: Battery.BatteryStateSubscription | null = null;

// Throttle tracking
let _lastPublishLat: number | null = null;
let _lastPublishLng: number | null = null;
let _lastPublishTime = 0;

const PUBLISH_MIN_MS   = 15_000;  // never publish more often than this
const PUBLISH_MAX_MS   = 30_000;  // always publish after this interval (refresh last-seen)
const PUBLISH_MIN_DIST = 20;      // metres — skip publish if moved less than this

// ─── Speed → status ───────────────────────────────────────────────────────────

export function speedToStatus(speedMs: number): MovementStatus {
  if (speedMs < 0.5) return 'stationary';
  if (speedMs < 8)   return 'walking';
  return 'driving';
}

// ─── Geo helper ───────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Init / Stop ──────────────────────────────────────────────────────────────

export async function initPublisher(userId: string, username?: string): Promise<void> {
  _userId    = userId;
  _username  = username ?? null;

  try {
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    _batteryLevel = level;
    _isCharging   =
      state === Battery.BatteryState.CHARGING ||
      state === Battery.BatteryState.FULL;
  } catch {
    // battery not available on all devices
  }

  _batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
    _batteryLevel = batteryLevel;
  });
  _chargingSubscription = Battery.addBatteryStateListener(({ batteryState }) => {
    _isCharging =
      batteryState === Battery.BatteryState.CHARGING ||
      batteryState === Battery.BatteryState.FULL;
  });

  await upsertProfile(userId);
}

export function stopPublisher(): void {
  _userId           = null;
  _username         = null;
  _lastPublishLat   = null;
  _lastPublishLng   = null;
  _lastPublishTime  = 0;
  _batterySubscription?.remove();
  _chargingSubscription?.remove();
  _batterySubscription  = null;
  _chargingSubscription = null;
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export async function publishLocation(
  lat: number,
  lng: number,
  speed: number,
  heading?: number,
): Promise<void> {
  if (!_userId) return;

  const now          = Date.now();
  const timeSinceLast = now - _lastPublishTime;

  // Hard minimum interval — never hammer the DB faster than this
  if (timeSinceLast < PUBLISH_MIN_MS) return;

  // Skip if we haven't moved enough and the max-refresh interval hasn't expired
  if (_lastPublishLat !== null && timeSinceLast < PUBLISH_MAX_MS) {
    const dist = haversineM(_lastPublishLat, _lastPublishLng!, lat, lng);
    if (dist < PUBLISH_MIN_DIST) return;
  }

  // Record before the await so concurrent calls don't double-publish
  _lastPublishLat  = lat;
  _lastPublishLng  = lng;
  _lastPublishTime = now;

  try {
    await supabase.from('friend_locations').upsert(
      {
        user_id:       _userId,
        lat,
        lng,
        speed,
        heading:       heading ?? null,
        battery_level: _batteryLevel,
        is_charging:   _isCharging,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  } catch {
    // non-critical — don't crash tracking
    // Reset time so the next call retries promptly
    _lastPublishTime = 0;
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

async function upsertProfile(userId: string): Promise<void> {
  try {
    const { data: authUser } = await supabase.auth.getUser();
    const displayName =
      authUser?.user?.user_metadata?.display_name ??
      authUser?.user?.email?.split('@')[0] ??
      'User';

    const row: Record<string, unknown> = {
      user_id:     userId,
      display_name: displayName,
      updated_at:  new Date().toISOString(),
    };
    // Only write username if we have one — avoids overwriting a DB value with null
    if (_username) row.username = _username;

    await supabase
      .from('user_profiles')
      .upsert(row, { onConflict: 'user_id' });
  } catch {
    // non-critical
  }
}
