/**
 * useInsights — generates pattern-based insights from local session
 * and summary data. No external AI API — pure client-side analytics.
 */
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@stores/authStore';
import { getSessionsForDate, getDailySummary } from '@services/localDB';
import { todayDateString } from '@services/summaryService';
import { COLORS } from '@constants/theme';

export interface Insight {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  tag: string;
  tagColor: string;
}

interface WeeklyScore {
  score: number;
  delta: number;
  label: string;
}

interface UseInsightsResult {
  insights: Insight[];
  weeklyScore: WeeklyScore;
  isLoading: boolean;
}

export function useInsights(): UseInsightsResult {
  const { user } = useAuthStore();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [weeklyScore, setWeeklyScore] = useState<WeeklyScore>({ score: 0, delta: 0, label: 'Not enough data yet' });
  const [isLoading, setIsLoading] = useState(true);

  const generate = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    try {
      const today = todayDateString();
      const todaySummary = await getDailySummary(user.id, today);
      const todaySessions = await getSessionsForDate(user.id, today);

      // Gather last 7 days of summaries
      const weekSummaries = await Promise.all(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return getDailySummary(user.id, d.toISOString().slice(0, 10));
        })
      );
      const validWeek = weekSummaries.filter(Boolean) as NonNullable<typeof weekSummaries[0]>[];

      // ── Weekly score (0–100) ──────────────────────────────────────────────
      const GOAL_DISTANCE_M = 8047;
      const GOAL_PLACES = 3;
      const avgDistance = validWeek.reduce((a, s) => a + s.totalDistanceM, 0) / Math.max(validWeek.length, 1);
      const avgPlaces = validWeek.reduce((a, s) => a + s.placesVisited, 0) / Math.max(validWeek.length, 1);
      const distScore = Math.min(100, (avgDistance / GOAL_DISTANCE_M) * 60);
      const placeScore = Math.min(40, (avgPlaces / GOAL_PLACES) * 40);
      const score = Math.round(distScore + placeScore);

      // Prev week delta (use second half of validWeek vs first half)
      const mid = Math.floor(validWeek.length / 2);
      const recentAvg = validWeek.slice(0, mid).reduce((a, s) => a + s.totalDistanceM, 0) / Math.max(mid, 1);
      const prevAvg = validWeek.slice(mid).reduce((a, s) => a + s.totalDistanceM, 0) / Math.max(mid, 1);
      const delta = prevAvg > 0 ? Math.round(((recentAvg - prevAvg) / prevAvg) * 100) : 0;

      setWeeklyScore({
        score,
        delta,
        label: delta >= 0 ? `+${delta}% from last week` : `${delta}% from last week`,
      });

      // ── Generate insights ─────────────────────────────────────────────────
      const generated: Insight[] = [];

      // 1. Most active day
      if (validWeek.length >= 3) {
        const best = validWeek.reduce((a, b) =>
          (a?.totalDistanceM ?? 0) > (b?.totalDistanceM ?? 0) ? a : b
        );
        const bestMi = (best.totalDistanceM / 1609.34).toFixed(1);
        const bestDate = new Date(best.date).toLocaleDateString('en-US', { weekday: 'long' });
        generated.push({
          id: 'most_active',
          icon: 'trending-up',
          iconColor: COLORS.success,
          title: 'Most active day this week',
          body: `${bestDate} was your most active day — you walked ${bestMi} mi and visited ${best.placesVisited} place${best.placesVisited !== 1 ? 's' : ''}.`,
          tag: 'ACTIVITY',
          tagColor: COLORS.success,
        });
      }

      // 2. Most frequent place today
      if (todaySessions.length > 0) {
        const freq: Record<string, number> = {};
        todaySessions.forEach((s) => { freq[s.placeName] = (freq[s.placeName] ?? 0) + 1; });
        const topPlace = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        if (topPlace) {
          generated.push({
            id: 'top_place',
            icon: 'location',
            iconColor: COLORS.warning,
            title: `Today\'s top spot`,
            body: `You spent the most time at ${topPlace[0]} today${todaySessions[0]?.address ? ` (${todaySessions[0].address})` : ''}.`,
            tag: 'PATTERN',
            tagColor: COLORS.warning,
          });
        }
      }

      // 3. Distance streak
      const streak = validWeek.filter((s) => s.totalDistanceM > 1000).length;
      if (streak >= 3) {
        generated.push({
          id: 'streak',
          icon: 'flame',
          iconColor: COLORS.warning,
          title: `${streak}-day activity streak`,
          body: `You\'ve been active every day for ${streak} days straight. Keep it going!`,
          tag: 'STREAK',
          tagColor: COLORS.warning,
        });
      }

      // 4. Goal progress today
      if (todaySummary && todaySummary.totalDistanceM > 0) {
        const pct = Math.round((todaySummary.totalDistanceM / GOAL_DISTANCE_M) * 100);
        const mi = (todaySummary.totalDistanceM / 1609.34).toFixed(1);
        generated.push({
          id: 'daily_goal',
          icon: pct >= 100 ? 'checkmark-circle' : 'flag-outline',
          iconColor: pct >= 100 ? COLORS.success : COLORS.primary,
          title: pct >= 100 ? 'Daily goal reached!' : `${pct}% of daily goal`,
          body: pct >= 100
            ? `You walked ${mi} mi today — you crushed your 5-mile goal!`
            : `You\'ve walked ${mi} mi so far. ${((GOAL_DISTANCE_M - todaySummary.totalDistanceM) / 1609.34).toFixed(1)} mi to go!`,
          tag: 'GOAL',
          tagColor: pct >= 100 ? COLORS.success : COLORS.primary,
        });
      }

      // 5. Transit usage
      const transitSessions = todaySessions.filter((s) => s.placeCategory === 'transit');
      if (transitSessions.length > 0) {
        const totalTransitMin = transitSessions.reduce((a, s) => a + (s.durationMin ?? 0), 0);
        generated.push({
          id: 'transit',
          icon: 'train',
          iconColor: COLORS.accent,
          title: 'Transit detected',
          body: `You used transit ${transitSessions.length} time${transitSessions.length > 1 ? 's' : ''} today, spending ~${totalTransitMin} min commuting.`,
          tag: 'COMMUTE',
          tagColor: COLORS.accent,
        });
      }

      // 6. Home time
      if (todaySummary && todaySummary.timeHomeMin > 0) {
        const homeH = Math.floor(todaySummary.timeHomeMin / 60);
        const homeM = todaySummary.timeHomeMin % 60;
        const homeLabel = homeH > 0 ? `${homeH}h ${homeM}m` : `${homeM}m`;
        generated.push({
          id: 'home_time',
          icon: 'home',
          iconColor: COLORS.primary,
          title: 'Home sweet home',
          body: `You\'ve spent ${homeLabel} at home today.`,
          tag: 'ROUTINE',
          tagColor: COLORS.primary,
        });
      }

      // Fallback if no data
      if (generated.length === 0) {
        generated.push({
          id: 'start',
          icon: 'footsteps',
          iconColor: COLORS.accent,
          title: 'Start your journey',
          body: 'Enable location tracking and start moving. Your insights will appear as your data builds up over the next few days.',
          tag: 'GETTING STARTED',
          tagColor: COLORS.accent,
        });
      }

      setInsights(generated);
    } catch (err) {
      console.error('[useInsights] failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { generate(); }, [generate]);

  return { insights, weeklyScore, isLoading };
}
