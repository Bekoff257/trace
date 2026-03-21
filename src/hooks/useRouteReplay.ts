/**
 * useRouteReplay — loads GPS points for a date and drives animated playback.
 * Returns a sliced coordinate array that grows as playback advances.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@stores/authStore';
import { getPointsForDate, getSessionsForDate } from '@services/localDB';
import { todayDateString } from '@services/summaryService';
import type { LocationPoint, VisitSession } from '@/types/index';

export type PlaybackSpeed = 1 | 2 | 4 | 8;

interface RouteCoord {
  latitude: number;
  longitude: number;
}

interface UseRouteReplayResult {
  /** Full route coords (for region fitting) */
  allCoords: RouteCoord[];
  /** Coords visible so far during playback */
  visibleCoords: RouteCoord[];
  /** Sessions shown as markers */
  sessions: VisitSession[];
  isLoading: boolean;
  isPlaying: boolean;
  progress: number;        // 0–1
  currentIndex: number;
  totalPoints: number;
  speed: PlaybackSpeed;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (s: PlaybackSpeed) => void;
  seekTo: (index: number) => void;
}

// Each tick advances this many points (at 1× speed)
const POINTS_PER_TICK = 3;
const TICK_MS = 100;

export function useRouteReplay(date?: string): UseRouteReplayResult {
  const { user } = useAuthStore();
  const targetDate = date ?? todayDateString();

  const [allPoints, setAllPoints] = useState<LocationPoint[]>([]);
  const [sessions, setSessions] = useState<VisitSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);
  const speedRef = useRef<PlaybackSpeed>(1);
  const totalRef = useRef(0);

  // Load data
  useEffect(() => {
    if (!user?.id) return;
    setIsLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);
    indexRef.current = 0;

    Promise.all([
      getPointsForDate(user.id, targetDate),
      getSessionsForDate(user.id, targetDate),
    ]).then(([points, sess]) => {
      setAllPoints(points);
      setSessions(sess);
      totalRef.current = points.length;
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [user?.id, targetDate]);

  // Sync speed ref
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Playback ticker
  const startTicker = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      const step = POINTS_PER_TICK * speedRef.current;
      const next = Math.min(indexRef.current + step, totalRef.current);
      indexRef.current = next;
      setCurrentIndex(next);
      if (next >= totalRef.current) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setIsPlaying(false);
      }
    }, TICK_MS);
  }, []);

  const stopTicker = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTicker(), [stopTicker]);

  const play = useCallback(() => {
    if (indexRef.current >= totalRef.current) {
      indexRef.current = 0;
      setCurrentIndex(0);
    }
    setIsPlaying(true);
    startTicker();
  }, [startTicker]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    stopTicker();
  }, [stopTicker]);

  const restart = useCallback(() => {
    stopTicker();
    indexRef.current = 0;
    setCurrentIndex(0);
    setIsPlaying(true);
    startTicker();
  }, [startTicker, stopTicker]);

  const seekTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, totalRef.current));
    indexRef.current = clamped;
    setCurrentIndex(clamped);
  }, []);

  const handleSetSpeed = useCallback((s: PlaybackSpeed) => {
    setSpeed(s);
    speedRef.current = s;
  }, []);

  const allCoords: RouteCoord[] = allPoints.map((p) => ({
    latitude: p.lat,
    longitude: p.lng,
  }));

  const visibleCoords = allCoords.slice(0, currentIndex);
  const progress = totalRef.current > 0 ? currentIndex / totalRef.current : 0;

  return {
    allCoords,
    visibleCoords,
    sessions,
    isLoading,
    isPlaying,
    progress,
    currentIndex,
    totalPoints: allPoints.length,
    speed,
    play,
    pause,
    restart,
    setSpeed: handleSetSpeed,
    seekTo,
  };
}
