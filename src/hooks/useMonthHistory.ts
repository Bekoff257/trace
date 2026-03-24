/**
 * useMonthHistory — loads all daily summaries for a given month,
 * returning a map of date → summary for the calendar view.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@stores/authStore';
import { getDailySummary } from '@services/localDB';
import { computeAndSaveDailySummary } from '@services/summaryService';
import type { DailySummary } from '@/types/index';

interface MonthDay {
  date: string;       // 'YYYY-MM-DD'
  day: number;        // 1-31
  summary: DailySummary | null;
  isToday: boolean;
  isFuture: boolean;
}

interface UseMonthHistoryResult {
  days: MonthDay[];
  isLoading: boolean;
  year: number;
  month: number;         // 0-indexed
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
}

export function useMonthHistory(): UseMonthHistoryResult {
  const { user } = useAuthStore();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [days, setDays] = useState<MonthDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadMonth = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    const today = new Date();
    // Use local date components so the "today" marker is timezone-correct
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    // Recompute summaries for any past day within the last 7 days that has
    // no saved summary yet (happens when the app was closed overnight).
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const loaded = await Promise.all(
      Array.from({ length: daysInMonth }, async (_, i) => {
        const d = i + 1;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayDate = new Date(year, month, d);
        const isFuture = dayDate > today;

        let summary: DailySummary | null = isFuture
          ? null
          : await getDailySummary(user.id, dateStr);

        // For recent past days with no cached summary, compute it now.
        // This catches days where the app was closed before summarising.
        if (!isFuture && !summary && dayDate >= sevenDaysAgo && dateStr !== todayStr) {
          const computed = await computeAndSaveDailySummary(user.id, dateStr);
          // Only treat as real data if location points actually exist
          summary = computed.pointsCount > 0 ? computed : null;
        }

        return {
          date: dateStr,
          day: d,
          summary,
          isToday: dateStr === todayStr,
          isFuture,
        };
      })
    );

    setDays(loaded);
    setIsLoading(false);
  }, [user?.id, year, month]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  const goToPrevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) { setYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    const now = new Date();
    // Don't navigate past current month
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth())) return;
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, [year, month]);

  return { days, isLoading, year, month, goToPrevMonth, goToNextMonth };
}
