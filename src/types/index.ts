// ─── User ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  homeLat?: number;
  homeLng?: number;
  workLat?: number;
  workLng?: number;
  timezone: string;
  trackingMode: 'always' | 'battery_saver' | 'off';
  createdAt: string;
  updatedAt: string;
}

// ─── Location ─────────────────────────────────────────────────────────────────
export interface LocationPoint {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number;
  altitude?: number;
  heading?: number;
  recordedAt: string;
  createdAt: string;
}

// ─── Places ───────────────────────────────────────────────────────────────────
export type PlaceCategory =
  | 'home'
  | 'work'
  | 'food'
  | 'transit'
  | 'fitness'
  | 'shopping'
  | 'nature'
  | 'other';

export interface VisitSession {
  id: string;
  userId: string;
  placeName: string;
  placeCategory: PlaceCategory;
  lat: number;
  lng: number;
  address?: string;
  startedAt: string;
  endedAt?: string;
  durationMin?: number;
  distanceFromPrevM?: number;
}

// ─── Daily Summary ────────────────────────────────────────────────────────────
export interface DailySummary {
  id: string;
  userId: string;
  date: string;
  totalDistanceM: number;
  stepsEstimated: number;
  placesVisited: number;
  timeOutsideMin: number;
  timeHomeMin: number;
  timeWorkMin: number;
  topPlace?: string;
  pointsCount: number;
  updatedAt: string;
}

// ─── Friends ──────────────────────────────────────────────────────────────────
export type MovementStatus = 'stationary' | 'walking' | 'driving';

export interface FriendLocation {
  userId: string;
  lat: number;
  lng: number;
  speed: number;
  heading?: number;
  batteryLevel?: number;   // 0–1
  isCharging?: boolean;
  updatedAt: string;
  status: MovementStatus;
}

export interface FriendProfile {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  username?: string;
}

export interface Friend extends FriendProfile {
  location?: FriendLocation;
  friendshipStatus: 'pending' | 'accepted';
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// ─── Tracking ─────────────────────────────────────────────────────────────────
export type TrackingMode = 'high_accuracy' | 'medium' | 'low_power' | 'off';

export interface TrackingState {
  isTracking: boolean;
  mode: TrackingMode;
  lastPoint?: LocationPoint;
  currentSession?: VisitSession;
  batteryLevel?: number;
}
