/**
 * useRouteReplay — time-accurate GPS playback with sub-point interpolation.
 *
 * Architecture:
 *   • Points are replayed in real GPS time: at speed X, 1 wall-second
 *     advances X GPS-seconds.
 *   • A 50ms ticker maps wall-clock offset → GPS target timestamp → index.
 *   • interpolatedHead is linearly blended between consecutive fixes so the
 *     head dot moves continuously even when GPS fixes are sparse (1-10s).
 *   • bearing is derived from adjacent point pairs for cinematic camera.
 *   • allSegments / visibleSegments split on GPS gaps (>30 s or >200 m).
 *   • cumDist is precomputed once on load for O(1) distance lookups.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuthStore } from '@stores/authStore';
import { getPointsForDate, getSessionsForDate } from '@services/localDB';
import { todayDateString } from '@services/summaryService';
import type { LocationPoint, VisitSession } from '@/types/index';

export type PlaybackSpeed = 1 | 5 | 20;

export interface ReplayLatLng {
  latitude: number;
  longitude: number;
}

export interface UseRouteReplayResult {
  /** Full day path split into continuous GPS segments (dim background). */
  allSegments: ReplayLatLng[][];
  /** Segments up to the current playback position (bright foreground). */
  visibleSegments: ReplayLatLng[][];
  /** Sub-point interpolated head — moves smoothly between GPS fixes. */
  interpolatedHead: ReplayLatLng | null;
  /** Current movement direction in degrees (0 = north). */
  bearing: number;
  /** Instantaneous speed at current index in m/s (from point metadata). */
  currentSpeedMs: number;
  /** Accumulated distance covered so far in metres. */
  cumulativeDistanceM: number;
  sessions: VisitSession[];
  isLoading: boolean;
  isPlaying: boolean;
  /** 0–1 playback progress. */
  progress: number;
  currentIndex: number;
  totalPoints: number;
  speed: PlaybackSpeed;
  currentTime: string | null;
  startTime: string | null;
  endTime: string | null;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (s: PlaybackSpeed) => void;
  seekTo: (index: number) => void;
  /** Lightweight replay summary suitable for Share.share(). */
  exportReplayData: () => object;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TICKER_MS = 50;      // ticker interval → ~20fps
const SEG_GAP_MS = 30_000; // time gap that starts a new segment
const SEG_GAP_M  = 200;    // distance jump that starts a new segment

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineM(a: ReplayLatLng, b: ReplayLatLng): number {
  const R = 6_371_000;
  const dLat = (b.latitude  - a.latitude)  * (Math.PI / 180);
  const dLng = (b.longitude - a.longitude) * (Math.PI / 180);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude  * (Math.PI / 180)) *
    Math.cos(b.latitude  * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function computeBearing(from: ReplayLatLng, to: ReplayLatLng): number {
  const dLng = (to.longitude - from.longitude) * (Math.PI / 180);
  const lat1 = from.latitude * (Math.PI / 180);
  const lat2 = to.latitude   * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function lerp(a: ReplayLatLng, b: ReplayLatLng, t: number): ReplayLatLng {
  return {
    latitude:  a.latitude  + (b.latitude  - a.latitude)  * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRouteReplay(date?: string): UseRouteReplayResult {
  const { user } = useAuthStore();
  const targetDate = date ?? todayDateString();

  const [allPoints,       setAllPoints]       = useState<LocationPoint[]>([]);
  const [sessions,        setSessions]        = useState<VisitSession[]>([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [currentIndex,    setCurrentIndex]    = useState(0);
  const [interpolatedHead,setInterpolatedHead]= useState<ReplayLatLng | null>(null);
  const [bearing,         setBearing]         = useState(0);
  const [isPlaying,       setIsPlaying]       = useState(false);
  const [speed,           setSpeedState]      = useState<PlaybackSpeed>(1);

  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef         = useRef(0);
  const speedRef         = useRef<PlaybackSpeed>(1);
  const totalRef         = useRef(0);
  const allPointsRef     = useRef<LocationPoint[]>([]);
  const allCoordsRef     = useRef<ReplayLatLng[]>([]);

  // Time-accurate playback anchors (reset on play/seek/speed-change)
  const playStartWallRef = useRef(0); // wall-clock ms when anchored
  const playStartGpsRef  = useRef(0); // GPS ms at anchor index

  // ── Precomputed coordinates ──────────────────────────────────────────────────

  const allCoords = useMemo<ReplayLatLng[]>(
    () => allPoints.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [allPoints],
  );

  // Keep refs current for use inside the ticker callback
  allPointsRef.current = allPoints;
  allCoordsRef.current = allCoords;

  /** Set of indices where a new segment begins (gap after previous point). */
  const segBreaks = useMemo<Set<number>>(() => {
    const s = new Set<number>([0]);
    for (let i = 1; i < allPoints.length; i++) {
      const dtMs =
        new Date(allPoints[i].recordedAt).getTime() -
        new Date(allPoints[i - 1].recordedAt).getTime();
      const dist = haversineM(allCoords[i - 1], allCoords[i]);
      if (dtMs > SEG_GAP_MS || dist > SEG_GAP_M) s.add(i);
    }
    return s;
  }, [allPoints, allCoords]);

  /** Index-aligned cumulative distance; gaps contribute 0. */
  const cumDist = useMemo<number[]>(() => {
    const d: number[] = [0];
    for (let i = 1; i < allCoords.length; i++) {
      d.push(
        segBreaks.has(i)
          ? d[i - 1]
          : d[i - 1] + haversineM(allCoords[i - 1], allCoords[i]),
      );
    }
    return d;
  }, [allCoords, segBreaks]);

  // ── Data loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return;
    setIsLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);
    setInterpolatedHead(null);
    setBearing(0);
    indexRef.current = 0;

    Promise.all([
      getPointsForDate(user.id, targetDate),
      getSessionsForDate(user.id, targetDate),
    ])
      .then(([points, sess]) => {
        setAllPoints(points);
        setSessions(sess);
        totalRef.current = points.length;
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [user?.id, targetDate]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // ── Ticker ────────────────────────────────────────────────────────────────────

  const stopTicker = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTicker(), [stopTicker]);

  const advancePlayback = useCallback(() => {
    const pts    = allPointsRef.current;
    const coords = allCoordsRef.current;
    const total  = totalRef.current;
    if (total === 0) return;

    const wallElapsed = Date.now() - playStartWallRef.current;
    const gpsTargetMs = playStartGpsRef.current + wallElapsed * speedRef.current;

    // Scan forward from current index until we overshoot the GPS target
    let idx = indexRef.current;
    while (idx < total - 1) {
      if (new Date(pts[idx + 1].recordedAt).getTime() > gpsTargetMs) break;
      idx++;
    }

    indexRef.current = idx;
    setCurrentIndex(idx);

    if (idx < total - 1) {
      const fromMs = new Date(pts[idx].recordedAt).getTime();
      const toMs   = new Date(pts[idx + 1].recordedAt).getTime();
      const span   = toMs - fromMs;
      const t      = span > 0 ? Math.min(1, (gpsTargetMs - fromMs) / span) : 0;
      setInterpolatedHead(lerp(coords[idx], coords[idx + 1], t));
      setBearing(computeBearing(coords[idx], coords[idx + 1]));
    } else {
      // Reached end
      if (coords[total - 1]) setInterpolatedHead(coords[total - 1]);
      stopTicker();
      setIsPlaying(false);
    }
  }, [stopTicker]);

  const startTicker = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(advancePlayback, TICKER_MS);
  }, [advancePlayback]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Record the GPS time anchor so playback resumes from the correct position. */
  const anchorNow = useCallback((idx: number) => {
    const pt = allPointsRef.current[idx];
    if (pt) {
      playStartWallRef.current = Date.now();
      playStartGpsRef.current  = new Date(pt.recordedAt).getTime();
    }
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    const total = totalRef.current;
    if (total === 0) return;
    if (indexRef.current >= total - 1) {
      indexRef.current = 0;
      setCurrentIndex(0);
    }
    anchorNow(indexRef.current);
    setIsPlaying(true);
    startTicker();
  }, [anchorNow, startTicker]);

  const pause = useCallback(() => {
    stopTicker();
    setIsPlaying(false);
  }, [stopTicker]);

  const restart = useCallback(() => {
    stopTicker();
    indexRef.current = 0;
    setCurrentIndex(0);
    setInterpolatedHead(null);
    anchorNow(0);
    setIsPlaying(true);
    startTicker();
  }, [anchorNow, startTicker, stopTicker]);

  const seekTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, totalRef.current - 1));
    indexRef.current = clamped;
    setCurrentIndex(clamped);
    const coord = allCoordsRef.current[clamped];
    if (coord) setInterpolatedHead(coord);
    anchorNow(clamped);
  }, [anchorNow]);

  const handleSetSpeed = useCallback((s: PlaybackSpeed) => {
    setSpeedState(s);
    speedRef.current = s;
    // Re-anchor from current position so the speed change is seamless
    anchorNow(indexRef.current);
  }, [anchorNow]);

  // ── Derived segments ──────────────────────────────────────────────────────────

  const allSegments = useMemo<ReplayLatLng[][]>(() => {
    const segs: ReplayLatLng[][] = [];
    let cur: ReplayLatLng[] = [];
    for (let i = 0; i < allCoords.length; i++) {
      if (segBreaks.has(i) && cur.length > 0) { segs.push(cur); cur = []; }
      cur.push(allCoords[i]);
    }
    if (cur.length > 0) segs.push(cur);
    return segs.filter((s) => s.length >= 2);
  }, [allCoords, segBreaks]);

  const visibleSegments = useMemo<ReplayLatLng[][]>(() => {
    const upTo = currentIndex + 1;
    const segs: ReplayLatLng[][] = [];
    let cur: ReplayLatLng[] = [];
    for (let i = 0; i < upTo && i < allCoords.length; i++) {
      if (segBreaks.has(i) && cur.length > 0) { segs.push(cur); cur = []; }
      cur.push(allCoords[i]);
    }
    if (cur.length > 0) segs.push(cur);
    return segs.filter((s) => s.length >= 2);
  }, [allCoords, segBreaks, currentIndex]);

  // ── Scalar derivations ────────────────────────────────────────────────────────

  const progress             = totalRef.current > 1 ? currentIndex / (totalRef.current - 1) : 0;
  const cumulativeDistanceM  = cumDist[currentIndex] ?? 0;
  const currentSpeedMs       = allPoints[currentIndex]?.speed ?? 0;
  const currentPoint         = allPoints[currentIndex] ?? null;

  const exportReplayData = useCallback((): object => {
    const pts      = allPointsRef.current;
    const totalDist = cumDist[cumDist.length - 1] ?? 0;
    return {
      date: targetDate,
      totalPoints: pts.length,
      totalDistanceM: Math.round(totalDist),
      durationMs:
        pts.length > 1
          ? new Date(pts[pts.length - 1].recordedAt).getTime() -
            new Date(pts[0].recordedAt).getTime()
          : 0,
      path: pts
        .filter((_, i) => i % 5 === 0)
        .map((p) => ({ lat: p.lat, lng: p.lng, t: p.recordedAt })),
    };
  }, [targetDate, cumDist]);

  return {
    allSegments,
    visibleSegments,
    interpolatedHead,
    bearing,
    currentSpeedMs,
    cumulativeDistanceM,
    sessions,
    isLoading,
    isPlaying,
    progress,
    currentIndex,
    totalPoints: allPoints.length,
    speed,
    currentTime:  currentPoint?.recordedAt                    ?? null,
    startTime:    allPoints[0]?.recordedAt                    ?? null,
    endTime:      allPoints[allPoints.length - 1]?.recordedAt ?? null,
    play,
    pause,
    restart,
    setSpeed: handleSetSpeed,
    seekTo,
    exportReplayData,
  };
}
