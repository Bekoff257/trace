/**
 * Local SQLite database — offline-first store for raw location points,
 * visit sessions, and daily summaries.
 *
 * Each user gets an isolated database file: app_user_{userId}.db
 * Call openUserDB(userId) after sign-in and closeUserDB() after sign-out.
 */
import * as SQLite from 'expo-sqlite';
import type { LocationPoint, VisitSession, DailySummary } from '@/types/index';

// ─── Per-user DB lifecycle ────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<void> | null = null;
let _currentUserId: string | null = null;

function dbName(userId: string): string {
  return `app_user_${userId.replace(/[^a-zA-Z0-9]/g, '_')}.db`;
}

/**
 * Open (or reuse) the database for this user.
 * Safe to call multiple times — no-ops if same user's DB is already open.
 * Must be called before any DB reads/writes.
 */
export async function openUserDB(userId: string): Promise<void> {
  if (_currentUserId === userId && _db) return; // already open for this user

  // Close any existing connection
  await closeUserDB();

  _currentUserId = userId;
  _initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(dbName(userId));
    await migrate(db);
    _db = db;
  })();

  try {
    await _initPromise;
  } finally {
    _initPromise = null;
  }
}

/**
 * Close the current user's database and clear all references.
 * Call on sign-out.
 */
export async function closeUserDB(): Promise<void> {
  // Wait for any pending open to finish first
  if (_initPromise) {
    try { await _initPromise; } catch {}
    _initPromise = null;
  }
  if (_db) {
    try { await _db.closeAsync(); } catch {}
    _db = null;
  }
  _currentUserId = null;
}

function isStaleHandleError(err: any): boolean {
  const msg = (err?.message ?? '').toLowerCase();
  return (
    msg.includes('nullpointerexception') ||
    msg.includes('call to function') ||
    msg.includes('destroyed') ||
    msg.includes('closed') ||
    msg.includes('null')
  );
}

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  // Wait for a pending open
  if (_initPromise) await _initPromise;
  if (_db) return _db;
  throw new Error('[LocalDB] No database open. Call openUserDB(userId) first.');
}

async function withDB<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  try {
    const db = await getDB();
    return await fn(db);
  } catch (err: any) {
    if (isStaleHandleError(err) && _currentUserId) {
      // Stale handle — reopen and retry once
      _db = null;
      await openUserDB(_currentUserId);
      const db = await getDB();
      return await fn(db);
    }
    throw err;
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync(`PRAGMA journal_mode = WAL`);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS location_points (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      lat         REAL NOT NULL,
      lng         REAL NOT NULL,
      accuracy    REAL,
      speed       REAL,
      altitude    REAL,
      heading     REAL,
      recorded_at TEXT NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_lp_user_time ON location_points (user_id, recorded_at)`);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS visit_sessions (
      id                    TEXT PRIMARY KEY,
      user_id               TEXT NOT NULL,
      place_name            TEXT NOT NULL,
      place_category        TEXT NOT NULL DEFAULT 'other',
      lat                   REAL NOT NULL,
      lng                   REAL NOT NULL,
      address               TEXT,
      started_at            TEXT NOT NULL,
      ended_at              TEXT,
      duration_min          INTEGER,
      distance_from_prev_m  REAL,
      synced                INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_vs_user_time ON visit_sessions (user_id, started_at)`);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS daily_summaries (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      date              TEXT NOT NULL,
      total_distance_m  REAL NOT NULL DEFAULT 0,
      steps_estimated   INTEGER NOT NULL DEFAULT 0,
      places_visited    INTEGER NOT NULL DEFAULT 0,
      time_outside_min  INTEGER NOT NULL DEFAULT 0,
      time_home_min     INTEGER NOT NULL DEFAULT 0,
      time_work_min     INTEGER NOT NULL DEFAULT 0,
      top_place         TEXT,
      points_count      INTEGER NOT NULL DEFAULT 0,
      updated_at        TEXT NOT NULL,
      UNIQUE(user_id, date)
    )
  `);
}

// ─── Location Points ──────────────────────────────────────────────────────────

export async function insertLocationPoint(point: LocationPoint): Promise<void> {
  await withDB((db) => db.runAsync(
    `INSERT OR REPLACE INTO location_points
      (id, user_id, lat, lng, accuracy, speed, altitude, heading, recorded_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [point.id, point.userId, point.lat, point.lng, point.accuracy, point.speed,
     point.altitude ?? null, point.heading ?? null, point.recordedAt]
  ));
}

export async function getUnsyncedPoints(userId: string, limit = 500): Promise<LocationPoint[]> {
  return withDB((db) => db.getAllAsync<any>(
    `SELECT * FROM location_points WHERE user_id = ? AND synced = 0
     ORDER BY recorded_at ASC LIMIT ?`,
    [userId, limit]
  )).then((rows) => rows.map(rowToLocationPoint));
}

export async function markPointsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await withDB((db) => db.runAsync(
    `UPDATE location_points SET synced = 1 WHERE id IN (${placeholders})`, ids
  ));
}

export async function getPointsForDate(userId: string, date: string): Promise<LocationPoint[]> {
  return withDB((db) => db.getAllAsync<any>(
    `SELECT * FROM location_points
     WHERE user_id = ? AND recorded_at >= ? AND recorded_at < ?
     ORDER BY recorded_at ASC`,
    [userId, `${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`]
  )).then((rows) => rows.map(rowToLocationPoint));
}

export async function purgeOldPoints(beforeDate: string): Promise<void> {
  await withDB((db) => db.runAsync(
    `DELETE FROM location_points WHERE recorded_at < ? AND synced = 1`,
    [beforeDate]
  ));
}

// ─── Visit Sessions ───────────────────────────────────────────────────────────

export async function upsertVisitSession(session: VisitSession): Promise<void> {
  await withDB((db) => db.runAsync(
    `INSERT OR REPLACE INTO visit_sessions
      (id, user_id, place_name, place_category, lat, lng, address,
       started_at, ended_at, duration_min, distance_from_prev_m, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [session.id, session.userId, session.placeName, session.placeCategory,
     session.lat, session.lng, session.address ?? null,
     session.startedAt, session.endedAt ?? null,
     session.durationMin ?? null, session.distanceFromPrevM ?? null]
  ));
}

export async function getSessionsForDate(userId: string, date: string): Promise<VisitSession[]> {
  return withDB((db) => db.getAllAsync<any>(
    `SELECT * FROM visit_sessions
     WHERE user_id = ? AND started_at >= ? AND started_at < ?
     ORDER BY started_at DESC`,
    [userId, `${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`]
  )).then((rows) => rows.map(rowToVisitSession));
}

export async function getActiveSession(userId: string): Promise<VisitSession | null> {
  return withDB((db) => db.getFirstAsync<any>(
    `SELECT * FROM visit_sessions WHERE user_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [userId]
  )).then((row) => row ? rowToVisitSession(row) : null);
}

export async function endVisitSession(id: string, endedAt: string, durationMin: number): Promise<void> {
  await withDB((db) => db.runAsync(
    `UPDATE visit_sessions SET ended_at = ?, duration_min = ?, synced = 0 WHERE id = ?`,
    [endedAt, durationMin, id]
  ));
}

export async function getUnsyncedSessions(userId: string): Promise<VisitSession[]> {
  return withDB((db) => db.getAllAsync<any>(
    `SELECT * FROM visit_sessions WHERE user_id = ? AND synced = 0`,
    [userId]
  )).then((rows) => rows.map(rowToVisitSession));
}

export async function markSessionsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await withDB((db) => db.runAsync(
    `UPDATE visit_sessions SET synced = 1 WHERE id IN (${placeholders})`, ids
  ));
}

// ─── Daily Summaries ──────────────────────────────────────────────────────────

export async function upsertDailySummary(summary: DailySummary): Promise<void> {
  await withDB((db) => db.runAsync(
    `INSERT OR REPLACE INTO daily_summaries
      (id, user_id, date, total_distance_m, steps_estimated, places_visited,
       time_outside_min, time_home_min, time_work_min, top_place, points_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [summary.id, summary.userId, summary.date, summary.totalDistanceM,
     summary.stepsEstimated, summary.placesVisited, summary.timeOutsideMin,
     summary.timeHomeMin, summary.timeWorkMin, summary.topPlace ?? null,
     summary.pointsCount, summary.updatedAt]
  ));
}

export async function getDailySummary(userId: string, date: string): Promise<DailySummary | null> {
  return withDB((db) => db.getFirstAsync<any>(
    `SELECT * FROM daily_summaries WHERE user_id = ? AND date = ?`,
    [userId, date]
  )).then((row) => row ? rowToDailySummary(row) : null);
}

// ─── Place queries ────────────────────────────────────────────────────────────

export async function getSessionById(id: string): Promise<VisitSession | null> {
  return withDB((db) => db.getFirstAsync<any>(
    `SELECT * FROM visit_sessions WHERE id = ?`, [id]
  )).then((row) => row ? rowToVisitSession(row) : null);
}

export async function getSessionsByPlaceName(userId: string, placeName: string): Promise<VisitSession[]> {
  return withDB((db) => db.getAllAsync<any>(
    `SELECT * FROM visit_sessions WHERE user_id = ? AND place_name = ? ORDER BY started_at DESC`,
    [userId, placeName]
  )).then((rows) => rows.map(rowToVisitSession));
}

// ─── Data deletion ────────────────────────────────────────────────────────────

export async function deleteAllUserData(userId: string): Promise<void> {
  await withDB(async (db) => {
    await db.runAsync(`DELETE FROM location_points WHERE user_id = ?`, [userId]);
    await db.runAsync(`DELETE FROM visit_sessions WHERE user_id = ?`, [userId]);
    await db.runAsync(`DELETE FROM daily_summaries WHERE user_id = ?`, [userId]);
  });
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToLocationPoint(row: any): LocationPoint {
  return {
    id: row.id,
    userId: row.user_id,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    speed: row.speed,
    altitude: row.altitude,
    heading: row.heading,
    recordedAt: row.recorded_at,
    createdAt: row.recorded_at,
  };
}

function rowToVisitSession(row: any): VisitSession {
  return {
    id: row.id,
    userId: row.user_id,
    placeName: row.place_name,
    placeCategory: row.place_category,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMin: row.duration_min,
    distanceFromPrevM: row.distance_from_prev_m,
  };
}

function rowToDailySummary(row: any): DailySummary {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    totalDistanceM: row.total_distance_m,
    stepsEstimated: row.steps_estimated,
    placesVisited: row.places_visited,
    timeOutsideMin: row.time_outside_min,
    timeHomeMin: row.time_home_min,
    timeWorkMin: row.time_work_min,
    topPlace: row.top_place,
    pointsCount: row.points_count,
    updatedAt: row.updated_at,
  };
}
