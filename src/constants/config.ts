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
  MOVING_SPEED_THRESHOLD_MS: 1.0,   // m/s — below this = possibly stationary
  MAX_STORED_POINTS: 300,           // in-memory buffer
  SYNC_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes
  LOCAL_RETENTION_DAYS: 7,
} as const;

// Daily goal defaults
export const GOALS = {
  DAILY_DISTANCE_M: 8047, // ~5 miles
  DAILY_STEPS: 10_000,
  DAILY_PLACES: 3,
} as const;
