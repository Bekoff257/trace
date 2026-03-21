/**
 * useTimeline — returns the list of VisitSessions for a given date,
 * refreshing automatically when focus returns or on an interval.
 */
import { useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@stores/authStore';
import { getSessionsForDate } from '@services/localDB';
import { todayDateString } from '@services/summaryService';
import type { VisitSession } from '@/types/index';

interface UseTimelineResult {
  sessions: VisitSession[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useTimeline(date?: string): UseTimelineResult {
  const { user } = useAuthStore();
  const targetDate = date ?? todayDateString();

  const [sessions, setSessions] = useState<VisitSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getSessionsForDate(user.id, targetDate);
      setSessions(data);
    } catch (err) {
      console.error('[useTimeline] fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, targetDate]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    refresh();
  }, [refresh]);

  // Refresh when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Poll every 60 seconds while screen is mounted (catches live visits)
  useEffect(() => {
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { sessions, isLoading, refresh };
}
