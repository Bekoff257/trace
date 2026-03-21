import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@stores/authStore';
import { getDailySummary } from '@services/localDB';
import {
  computeAndSaveDailySummary,
  todayDateString,
} from '@services/summaryService';
import type { DailySummary } from '@/types/index';

interface UseDailySummaryResult {
  summary: DailySummary | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  distanceMi: number;
  progressToGoal: number; // 0–1
}

const DAILY_GOAL_M = 8047; // ~5 miles

export function useDailySummary(date?: string): UseDailySummaryResult {
  const { user } = useAuthStore();
  const targetDate = date ?? todayDateString();

  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      let s = await getDailySummary(user.id, targetDate);

      if (targetDate === todayDateString()) {
        s = await computeAndSaveDailySummary(user.id, targetDate);
      }

      setSummary(s);
    } catch (err) {
      console.error('[useDailySummary] failed:', err);
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

  useEffect(() => {
    if (targetDate !== todayDateString()) return;
    const timer = setInterval(refresh, 2 * 60_000);
    return () => clearInterval(timer);
  }, [refresh, targetDate]);

  const distanceMi = (summary?.totalDistanceM ?? 0) / 1609.34;
  const progressToGoal = Math.min(1, (summary?.totalDistanceM ?? 0) / DAILY_GOAL_M);

  return { summary, isLoading, refresh, distanceMi, progressToGoal };
}
