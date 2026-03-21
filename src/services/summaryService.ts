/**
 * Daily Summary Service — aggregates raw location points and visit sessions
 * into a DailySummary record. Called after each visit closes or on demand.
 */
import 'react-native-get-random-values';
import { haversineDistance } from '@utils/geo';
import { estimateSteps } from '@utils/formatters';
import {
  getPointsForDate,
  getSessionsForDate,
  upsertDailySummary,
  getDailySummary,
} from './localDB';
import type { DailySummary, VisitSession } from '@/types/index';

export async function computeAndSaveDailySummary(
  userId: string,
  date: string // 'YYYY-MM-DD'
): Promise<DailySummary> {
  const [points, sessions] = await Promise.all([
    getPointsForDate(userId, date),
    getSessionsForDate(userId, date),
  ]);

  // ── Total distance ────────────────────────────────────────────────────────
  let totalDistanceM = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineDistance(
      points[i - 1].lat, points[i - 1].lng,
      points[i].lat, points[i].lng
    );
    // Filter out GPS jumps > 500m per reading (teleport rejection)
    if (d < 500) totalDistanceM += d;
  }

  // ── Steps (estimated from distance) ──────────────────────────────────────
  const stepsEstimated = estimateSteps(totalDistanceM);

  // ── Places visited ────────────────────────────────────────────────────────
  const placesVisited = sessions.length;

  // ── Top place ─────────────────────────────────────────────────────────────
  const topPlace = getTopPlace(sessions);

  // ── Time breakdowns ───────────────────────────────────────────────────────
  let timeHomeMin = 0;
  let timeWorkMin = 0;
  let timeOutsideMin = 0;

  for (const s of sessions) {
    const duration = s.durationMin ?? 0;
    if (s.placeCategory === 'home') timeHomeMin += duration;
    else if (s.placeCategory === 'work') timeWorkMin += duration;
    else timeOutsideMin += duration;
  }

  // ── Build summary ─────────────────────────────────────────────────────────
  const existing = await getDailySummary(userId, date);

  const summary: DailySummary = {
    id: existing?.id ?? `ds_${userId}_${date}`,
    userId,
    date,
    totalDistanceM,
    stepsEstimated,
    placesVisited,
    timeOutsideMin,
    timeHomeMin,
    timeWorkMin,
    topPlace: topPlace ?? undefined,
    pointsCount: points.length,
    updatedAt: new Date().toISOString(),
  };

  await upsertDailySummary(summary);
  return summary;
}

function getTopPlace(sessions: VisitSession[]): string | null {
  if (sessions.length === 0) return null;

  const tally: Record<string, number> = {};
  for (const s of sessions) {
    tally[s.placeName] = (tally[s.placeName] ?? 0) + (s.durationMin ?? 0);
  }

  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}
