import { create } from 'zustand';
import type { LocationPoint, VisitSession, TrackingState, TrackingMode } from '@/types/index';

export type TrailStyle = 'lines' | 'footsteps';

// GPS gap thresholds — if two consecutive points exceed either threshold they
// are placed in separate path segments so the map never draws a straight line
// across an offline gap or a fast-vehicle jump.
const GAP_THRESHOLD_MS = 30_000;   // >30 s between points → new segment
const DIST_GAP_M       = 200;      // >200 m jump → new segment

export interface LatLng {
  latitude: number;
  longitude: number;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Build path segments from an ordered array of location points. */
function buildSegments(points: LocationPoint[]): LatLng[][] {
  const segments: LatLng[][] = [];
  let current: LatLng[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];

    if (
      prev &&
      (new Date(p.recordedAt).getTime() - new Date(prev.recordedAt).getTime() > GAP_THRESHOLD_MS ||
        haversineM(prev.lat, prev.lng, p.lat, p.lng) > DIST_GAP_M)
    ) {
      if (current.length > 0) segments.push(current);
      current = [];
    }

    current.push({ latitude: p.lat, longitude: p.lng });
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/** Sum distance across all segments, skipping cross-gap legs. */
function computeLiveDistanceM(points: LocationPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dtMs =
      new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime();
    if (dtMs > GAP_THRESHOLD_MS) continue; // time gap — don't count the jump
    const d = haversineM(prev.lat, prev.lng, curr.lat, curr.lng);
    if (d > DIST_GAP_M) continue; // distance gap — don't count the jump
    if (d < 500) total += d; // reject GPS teleport glitches
  }
  return total;
}

interface LocationState extends TrackingState {
  recentPoints: LocationPoint[];
  /** Route broken into continuous segments (split on > 30 s GPS gaps). */
  pathSegments: LatLng[][];
  /** Accumulated walking/moving distance for the current session (metres). */
  liveDistanceM: number;
  activeSessions: VisitSession[];
  trailStyle: TrailStyle;
  /** True while the app is in the background. GPS updates may be delayed. */
  isBackground: boolean;

  setTracking: (isTracking: boolean) => void;
  setTrackingMode: (mode: TrackingMode) => void;
  setTrailStyle: (style: TrailStyle) => void;
  setBackground: (isBackground: boolean) => void;
  addPoint: (point: LocationPoint) => void;
  setCurrentSession: (session: VisitSession | undefined) => void;
  endSession: (sessionId: string, endedAt: string) => void;
  /** Bulk-load points (e.g. from DB on app start). Recomputes segments. */
  setPoints: (points: LocationPoint[]) => void;
  /** Clear all in-memory tracking state (call on sign-out). */
  clearPoints: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  isTracking: false,
  mode: 'medium',
  trailStyle: 'lines',
  isBackground: false,
  lastPoint: undefined,
  currentSession: undefined,
  batteryLevel: undefined,
  recentPoints: [],
  pathSegments: [],
  liveDistanceM: 0,
  activeSessions: [],

  setTracking: (isTracking) => set({ isTracking }),

  setTrackingMode: (mode) => set({ mode }),

  setTrailStyle: (trailStyle) => set({ trailStyle }),

  setBackground: (isBackground) => set({ isBackground }),

  addPoint: (point) =>
    set((state) => {
      const prev = state.recentPoints[state.recentPoints.length - 1];

      // ── Gap detection ───────────────────────────────────────────────────
      const dtMs = prev
        ? new Date(point.recordedAt).getTime() - new Date(prev.recordedAt).getTime()
        : 0;
      const distFromPrev = prev ? haversineM(prev.lat, prev.lng, point.lat, point.lng) : 0;
      // Break segment on time gap OR implausible distance jump (offline/speed)
      const isGap = dtMs > GAP_THRESHOLD_MS || distFromPrev > DIST_GAP_M;

      // ── Incremental distance (skip across gaps) ─────────────────────────
      let addedDist = 0;
      if (prev && !isGap) {
        if (distFromPrev < 500) addedDist = distFromPrev; // guard against GPS teleports
      }

      // ── Path segments (immutable update) ───────────────────────────────
      const coord: LatLng = { latitude: point.lat, longitude: point.lng };
      let segments = state.pathSegments;

      if (segments.length === 0 || isGap) {
        // Start a new segment
        segments = [...segments, [coord]];
      } else {
        // Append to the last segment
        const last = segments[segments.length - 1];
        segments = [...segments.slice(0, -1), [...last, coord]];
      }

      return {
        lastPoint: point,
        recentPoints: [...state.recentPoints.slice(-299), point],
        pathSegments: segments,
        liveDistanceM: state.liveDistanceM + addedDist,
      };
    }),

  setCurrentSession: (session) => set({ currentSession: session }),

  endSession: (sessionId, endedAt) =>
    set((state) => ({
      currentSession:
        state.currentSession?.id === sessionId ? undefined : state.currentSession,
      activeSessions: state.activeSessions.map((s) =>
        s.id === sessionId ? { ...s, endedAt } : s
      ),
    })),

  setPoints: (points) => {
    const sliced = points.slice(-299);
    return set({
      recentPoints: sliced,
      lastPoint: sliced.length > 0 ? sliced[sliced.length - 1] : undefined,
      pathSegments: buildSegments(sliced),
      liveDistanceM: computeLiveDistanceM(sliced),
    });
  },

  clearPoints: () =>
    set({
      recentPoints: [],
      pathSegments: [],
      liveDistanceM: 0,
      lastPoint: undefined,
    }),
}));
