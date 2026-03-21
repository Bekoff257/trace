/**
 * Visit Detector — state machine that turns a stream of GPS points into
 * confirmed VisitSessions using a dwell-detection approach.
 *
 * Algorithm:
 *   1. Collect incoming points into a rolling buffer.
 *   2. If speed < threshold for N seconds → CANDIDATE state.
 *   3. If the candidate cluster persists for CONFIRM_SECONDS → CONFIRMED visit.
 *   4. When the device moves outside the cluster radius → close the session.
 *   5. Reverse-geocode the cluster centroid to get a place name.
 */
import * as Location from 'expo-location';
import 'react-native-get-random-values';
import { TRACKING } from '@constants/config';
import { haversineDistance, centroid } from '@utils/geo';
import { upsertVisitSession, endVisitSession, getActiveSession } from './localDB';
import { useLocationStore } from '@stores/locationStore';
import type { LocationPoint, VisitSession, PlaceCategory } from '@/types/index';

// ─── State ────────────────────────────────────────────────────────────────────

type DetectorState = 'moving' | 'candidate' | 'visiting';

interface DetectorCtx {
  state: DetectorState;
  candidateStart: Date | null;
  clusterCenter: { lat: number; lng: number } | null;
  clusterPoints: LocationPoint[];
  activeSession: VisitSession | null;
  userId: string;
}

const ctx: DetectorCtx = {
  state: 'moving',
  candidateStart: null,
  clusterCenter: null,
  clusterPoints: [],
  activeSession: null,
  userId: 'anonymous',
};

export function setDetectorUserId(userId: string): void {
  ctx.userId = userId;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function processNewPoint(point: LocationPoint): Promise<void> {
  // Hydrate active session from DB on first run
  if (!ctx.activeSession) {
    ctx.activeSession = await getActiveSession(ctx.userId);
    if (ctx.activeSession) {
      ctx.state = 'visiting';
      useLocationStore.getState().setCurrentSession(ctx.activeSession);
    }
  }

  const isStationary = point.speed < TRACKING.MOVING_SPEED_THRESHOLD_MS;

  switch (ctx.state) {
    case 'moving':
      if (isStationary) {
        ctx.state = 'candidate';
        ctx.candidateStart = new Date(point.recordedAt);
        ctx.clusterPoints = [point];
        ctx.clusterCenter = { lat: point.lat, lng: point.lng };
      }
      break;

    case 'candidate': {
      if (!isStationary || isOutsideCluster(point)) {
        // Device moved — reset
        ctx.state = 'moving';
        ctx.candidateStart = null;
        ctx.clusterPoints = [];
        ctx.clusterCenter = null;
        break;
      }

      ctx.clusterPoints.push(point);
      ctx.clusterCenter = centroid(ctx.clusterPoints);

      const dwellSeconds =
        (new Date(point.recordedAt).getTime() - ctx.candidateStart!.getTime()) / 1000;

      if (dwellSeconds >= TRACKING.VISIT_CONFIRM_SECONDS) {
        // Promoted to confirmed visit
        ctx.state = 'visiting';
        await openVisitSession(point);
      }
      break;
    }

    case 'visiting': {
      if (isOutsideCluster(point)) {
        // Device left — close session
        await closeVisitSession(point);
        ctx.state = 'moving';
        ctx.clusterPoints = [];
        ctx.clusterCenter = null;
        ctx.candidateStart = null;
      } else {
        // Still here — update cluster center
        ctx.clusterPoints.push(point);
        ctx.clusterCenter = centroid(ctx.clusterPoints);
      }
      break;
    }
  }
}

// ─── Session management ───────────────────────────────────────────────────────

async function openVisitSession(trigger: LocationPoint): Promise<void> {
  if (!ctx.clusterCenter) return;

  const { lat, lng } = ctx.clusterCenter;
  const { placeName, address, category } = await reverseGeocode(lat, lng);

  const session: VisitSession = {
    id: `vs_${ctx.userId}_${Date.now()}`,
    userId: ctx.userId,
    placeName,
    placeCategory: category,
    lat,
    lng,
    address,
    startedAt: ctx.candidateStart?.toISOString() ?? trigger.recordedAt,
    endedAt: undefined,
    durationMin: undefined,
    distanceFromPrevM: undefined,
  };

  ctx.activeSession = session;
  await upsertVisitSession(session);
  useLocationStore.getState().setCurrentSession(session);
}

async function closeVisitSession(trigger: LocationPoint): Promise<void> {
  if (!ctx.activeSession) return;

  const endedAt = trigger.recordedAt;
  const startMs = new Date(ctx.activeSession.startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  const durationMin = Math.round((endMs - startMs) / 60_000);

  await endVisitSession(ctx.activeSession.id, endedAt, durationMin);
  useLocationStore.getState().setCurrentSession(undefined);
  ctx.activeSession = null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOutsideCluster(point: LocationPoint): boolean {
  if (!ctx.clusterCenter) return true;
  return (
    haversineDistance(
      point.lat, point.lng,
      ctx.clusterCenter.lat, ctx.clusterCenter.lng
    ) > TRACKING.VISIT_DWELL_RADIUS_M
  );
}

// ─── Reverse Geocoding ────────────────────────────────────────────────────────

const GEOCODE_CATEGORY_MAP: Record<string, PlaceCategory> = {
  // Apple / Google types → our categories
  cafe:         'food',
  restaurant:   'food',
  bakery:       'food',
  bar:          'food',
  food:         'food',
  gym:          'fitness',
  fitness:      'fitness',
  park:         'nature',
  transit:      'transit',
  train:        'transit',
  subway:       'transit',
  bus:          'transit',
  airport:      'transit',
  store:        'shopping',
  shopping:     'shopping',
  mall:         'shopping',
  supermarket:  'shopping',
};

async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ placeName: string; address: string; category: PlaceCategory }> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });

    if (results.length === 0) throw new Error('no results');

    const r = results[0];

    // Build place name: prefer name, then street, then district
    const placeName =
      r.name ??
      r.street ??
      r.district ??
      r.city ??
      'Unknown Place';

    // Build address string
    const parts = [r.street, r.city, r.region].filter(Boolean);
    const address = parts.join(', ');

    // Detect category from subregion/type hints
    const hint = [r.name, r.subregion, r.district]
      .join(' ')
      .toLowerCase();

    let category: PlaceCategory = 'other';
    for (const [key, cat] of Object.entries(GEOCODE_CATEGORY_MAP)) {
      if (hint.includes(key)) {
        category = cat;
        break;
      }
    }

    return { placeName, address, category };
  } catch {
    return {
      placeName: 'Unknown Place',
      address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      category: 'other',
    };
  }
}
