// Location tracking constants
export const TRACKING = {
  BACKGROUND_TASK_NAME: 'LOCATION_BACKGROUND_TASK',
  VISIT_DWELL_RADIUS_M: 50,
  VISIT_DWELL_MIN_SECONDS: 180,     // 3 minutes to confirm a visit
  VISIT_CONFIRM_SECONDS: 300,       // 5 minutes to fully confirm
  HIGH_ACCURACY_MIN_DISTANCE_M: 5,
  HIGH_ACCURACY_INTERVAL_MS: 10_000,
  MEDIUM_MIN_DISTANCE_M: 20,
  MEDIUM_INTERVAL_MS: 30_000,
  LOW_POWER_MIN_DISTANCE_M: 50,
  LOW_POWER_INTERVAL_MS: 300_000,
  MOVING_SPEED_THRESHOLD_MS: 1.0,   // m/s — below this = stationary, skip
  MAX_STORED_POINTS: 300,           // in-memory buffer
  SYNC_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes
  LOCAL_RETENTION_DAYS: 7,
  // GPS filtering
  ACCURACY_THRESHOLD_M: 20,         // reject points with accuracy worse than this
  FREEZE_RADIUS_M: 5,               // hard freeze: always lock if dist < this (micro-jitter)
  MIN_DISTANCE_M: 10,               // stationary zone: count consecutive readings < this
  UNLOCK_DISTANCE_M: 15,            // must exceed this to exit stationary state (soft unlock)
  STATIONARY_LOCK_COUNT: 3,         // consecutive stationary readings before locking position
  THROTTLE_MS: 2500,                // minimum ms between evaluated points
  MAX_JUMP_M: 100,                  // reject GPS glitches larger than this
  SMOOTH_BUFFER_SIZE: 3,            // accepted-point buffer size for path smoothing
} as const;

// Daily goal defaults
export const GOALS = {
  DAILY_DISTANCE_M: 8047, // ~5 miles
  DAILY_STEPS: 10_000,
  DAILY_PLACES: 3,
} as const;
