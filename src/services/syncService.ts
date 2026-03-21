/**
 * Sync Service — batches local SQLite data to Supabase.
 * Runs on a timer (every 15 min) and on demand.
 * Only runs when the user has an active session.
 */
import { supabase } from './supabaseClient';
import {
  getUnsyncedPoints,
  markPointsSynced,
  getUnsyncedSessions,
  markSessionsSynced,
  purgeOldPoints,
  getDailySummary,
} from './localDB';
import { todayDateString } from './summaryService';
import { TRACKING } from '@constants/config';

let _syncTimer: ReturnType<typeof setInterval> | null = null;
let _isSyncing = false;

// ─── Start / stop ─────────────────────────────────────────────────────────────

export function startAutoSync(userId: string): void {
  stopAutoSync();
  _syncTimer = setInterval(() => {
    runSync(userId).catch(console.error);
  }, TRACKING.SYNC_INTERVAL_MS);
}

export function stopAutoSync(): void {
  if (_syncTimer) {
    clearInterval(_syncTimer);
    _syncTimer = null;
  }
}

// ─── Main sync ────────────────────────────────────────────────────────────────

export async function runSync(userId: string): Promise<void> {
  if (_isSyncing) return;
  _isSyncing = true;

  try {
    await syncLocationPoints(userId);
    await syncVisitSessions(userId);
    await syncDailySummary(userId);
    await purgeOldLocalData();
  } catch (err: any) {
    const msg = (err?.message ?? '').toLowerCase();
    const isStaleDB =
      msg.includes('call to function') ||
      msg.includes('nullpointerexception') ||
      msg.includes('destroyed') ||
      msg.includes('closed');
    if (!isStaleDB) {
      console.error('[SyncService] Sync failed:', err);
    }
    // Stale DB handle — withDB will recover on the next call, skip this cycle silently
  } finally {
    _isSyncing = false;
  }
}

// ─── Location points ──────────────────────────────────────────────────────────

async function syncLocationPoints(userId: string): Promise<void> {
  const points = await getUnsyncedPoints(userId, 500);
  if (points.length === 0) return;

  const rows = points.map((p) => ({
    user_id: p.userId,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    speed: p.speed,
    altitude: p.altitude ?? null,
    heading: p.heading ?? null,
    recorded_at: p.recordedAt,
  }));

  const { error } = await supabase
    .from('location_points')
    .insert(rows);

  if (error) throw error;
  await markPointsSynced(points.map((p) => p.id));
}

// ─── Visit sessions ───────────────────────────────────────────────────────────

async function syncVisitSessions(userId: string): Promise<void> {
  const sessions = await getUnsyncedSessions(userId);
  if (sessions.length === 0) return;

  const rows = sessions.map((s) => ({
    id: s.id,
    user_id: s.userId,
    place_name: s.placeName,
    place_category: s.placeCategory,
    lat: s.lat,
    lng: s.lng,
    address: s.address ?? null,
    started_at: s.startedAt,
    ended_at: s.endedAt ?? null,
    distance_from_prev_m: s.distanceFromPrevM ?? null,
  }));

  const { error } = await supabase
    .from('visit_sessions')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
  await markSessionsSynced(sessions.map((s) => s.id));
}

// ─── Daily summary ────────────────────────────────────────────────────────────

async function syncDailySummary(userId: string): Promise<void> {
  const today = todayDateString();
  const summary = await getDailySummary(userId, today);
  if (!summary) return;

  const { error } = await supabase.from('daily_summaries').upsert(
    {
      user_id: summary.userId,
      date: summary.date,
      total_distance_m: summary.totalDistanceM,
      steps_estimated: summary.stepsEstimated,
      places_visited: summary.placesVisited,
      time_outside_min: summary.timeOutsideMin,
      time_home_min: summary.timeHomeMin,
      time_work_min: summary.timeWorkMin,
      top_place: summary.topPlace ?? null,
      points_count: summary.pointsCount,
      updated_at: summary.updatedAt,
    },
    { onConflict: 'user_id,date' }
  );

  if (error) throw error;
}

// ─── Local data purge ─────────────────────────────────────────────────────────

async function purgeOldLocalData(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRACKING.LOCAL_RETENTION_DAYS);
  await purgeOldPoints(cutoff.toISOString());
}
