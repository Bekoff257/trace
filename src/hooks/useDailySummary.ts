import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@stores/authStore';
import { useLocationStore } from '@stores/locationStore';
import { getSessionsForDate } from '@services/localDB';
import { todayDateString } from '@services/summaryService';
import type { VisitSession } from '@/types/index';

const DAILY_GOAL_M = 8047; // ~5 miles
const GAP_MS = 30_000;

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

export interface DailySummaryResult {
  /** Distance in miles, computed live from in-memory GPS points. */
  distanceMi: number;
  /** Steps estimated from distance (live). */
  stepsEstimated: number;
  /** Minutes spent outside today (from DB sessions). */
  timeOutsideMin: number;
  /** Number of places visited (from DB sessions). */
  placesVisited: number;
  /** 0–1 fraction of daily distance goal. */
  progressToGoal: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useDailySummary(date?: string): DailySummaryResult {
  const { user } = useAuthStore();
  const { recentPoints } = useLocationStore();
  const targetDate = date ?? todayDateString();
  const isToday = targetDate === todayDateString();

  // ── Session-based stats from DB (places, time outside) ─────────────────
  const [sessions, setSessions] = useState<VisitSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getSessionsForDate(user.id, targetDate);
      setSessions(data);
    } catch {
      // DB may not be open yet — silently ignore, next poll will retry
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, targetDate]);

  useEffect(() => {
    setIsLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Poll every 30 s for session data (places, time outside)
  useEffect(() => {
    if (targetDate !== todayDateString()) return;
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh, targetDate]);

  // ── Live distance from in-memory GPS points ─────────────────────────────
  // For today, compute directly from recentPoints (updates on every GPS fix).
  // For past dates, fall back to 0 (caller uses history screen which has its own data).
  const liveDistanceM = useMemo(() => {
    if (!isToday || recentPoints.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < recentPoints.length; i++) {
      const prev = recentPoints[i - 1];
      const curr = recentPoints[i];
      const dtMs =
        new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime();
      if (dtMs > GAP_MS) continue; // skip across GPS gaps
      const d = haversineM(prev.lat, prev.lng, curr.lat, curr.lng);
      if (d < 500) total += d; // reject GPS teleport glitches
    }
    return total;
  }, [recentPoints, isToday]);

  // ── Session-derived stats ───────────────────────────────────────────────
  const timeOutsideMin = useMemo(() => {
    let total = 0;
    for (const s of sessions) {
      const cat = s.placeCategory;
      if (cat !== 'home' && cat !== 'work') total += s.durationMin ?? 0;
    }
    return total;
  }, [sessions]);

  const placesVisited = sessions.length;

  const stepsEstimated = Math.round(liveDistanceM / 0.762);
  const distanceMi = liveDistanceM / 1609.34;
  const progressToGoal = Math.min(1, liveDistanceM / DAILY_GOAL_M);

  return {
    distanceMi,
    stepsEstimated,
    timeOutsideMin,
    placesVisited,
    progressToGoal,
    isLoading,
    refresh,
  };
}
