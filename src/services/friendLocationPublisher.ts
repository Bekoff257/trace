/**
 * Friend Location Publisher
 * Upserts the current user's location + battery to friend_locations in Supabase.
 * Called on every foreground GPS update and from the background task.
 */
import * as Battery from 'expo-battery';
import { supabase } from './supabaseClient';
import type { MovementStatus } from '@/types/index';

let _userId: string | null = null;
let _batteryLevel: number | null = null;
let _isCharging = false;
let _batterySubscription: Battery.BatteryLevelSubscription | null = null;
let _chargingSubscription: Battery.BatteryStateSubscription | null = null;

// ─── Speed → status ───────────────────────────────────────────────────────────

export function speedToStatus(speedMs: number): MovementStatus {
  if (speedMs < 0.5) return 'stationary';
  if (speedMs < 8) return 'walking';
  return 'driving';
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initPublisher(userId: string): Promise<void> {
  _userId = userId;

  try {
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    _batteryLevel = level;
    _isCharging = state === Battery.BatteryState.CHARGING ||
                  state === Battery.BatteryState.FULL;
  } catch {
    // battery not available on all devices
  }

  // Keep battery updated in background
  _batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
    _batteryLevel = batteryLevel;
  });
  _chargingSubscription = Battery.addBatteryStateListener(({ batteryState }) => {
    _isCharging = batteryState === Battery.BatteryState.CHARGING ||
                  batteryState === Battery.BatteryState.FULL;
  });

  // Upsert profile row so friends can see display name
  await upsertProfile(userId);
}

export function stopPublisher(): void {
  _userId = null;
  _batterySubscription?.remove();
  _chargingSubscription?.remove();
  _batterySubscription = null;
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

  try {
    await supabase.from('friend_locations').upsert({
      user_id: _userId,
      lat,
      lng,
      speed,
      heading: heading ?? null,
      battery_level: _batteryLevel,
      is_charging: _isCharging,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch {
    // non-critical — don't crash tracking
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

    await supabase.from('user_profiles').upsert({
      user_id: userId,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch {
    // non-critical
  }
}
