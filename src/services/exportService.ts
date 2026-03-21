/**
 * Export Service — generates CSV data from local SQLite and
 * triggers the native share sheet.
 */
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { getSessionsForDate, getPointsForDate } from './localDB';
import type { VisitSession, LocationPoint } from '@/types/index';

// ─── Visit Sessions CSV ───────────────────────────────────────────────────────

export async function exportVisitSessionsCSV(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<void> {
  // Generate list of dates in range
  const dates = getDatesInRange(fromDate, toDate);

  const allSessions: VisitSession[] = [];
  for (const date of dates) {
    const sessions = await getSessionsForDate(userId, date);
    allSessions.push(...sessions);
  }

  const header = 'id,place_name,category,address,lat,lng,started_at,ended_at,duration_min,distance_from_prev_m\n';
  const rows = allSessions
    .map((s) =>
      [
        s.id,
        csvEscape(s.placeName),
        s.placeCategory,
        csvEscape(s.address ?? ''),
        s.lat,
        s.lng,
        s.startedAt,
        s.endedAt ?? '',
        s.durationMin ?? '',
        s.distanceFromPrevM ?? '',
      ].join(',')
    )
    .join('\n');

  const csv = header + rows;
  await writeAndShare(csv, `location_history_${fromDate}_to_${toDate}.csv`);
}

// ─── Raw GPS Points CSV ───────────────────────────────────────────────────────

export async function exportLocationPointsCSV(
  userId: string,
  date: string
): Promise<void> {
  const points = await getPointsForDate(userId, date);

  const header = 'id,lat,lng,accuracy,speed,altitude,heading,recorded_at\n';
  const rows = points
    .map((p: LocationPoint) =>
      [
        p.id,
        p.lat,
        p.lng,
        p.accuracy,
        p.speed,
        p.altitude ?? '',
        p.heading ?? '',
        p.recordedAt,
      ].join(',')
    )
    .join('\n');

  const csv = header + rows;
  await writeAndShare(csv, `gps_points_${date}.csv`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAndShare(content: string, filename: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.write(content);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Location History',
    UTI: 'public.comma-separated-values-text',
  });
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
