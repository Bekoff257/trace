/**
 * Road snapper — snaps raw GPS coordinates to the nearest road geometry
 * using OSRM's public map-matching API (OpenStreetMap data, global coverage).
 *
 * Pipeline:  raw GPS → decimate (≥20 m apart) → OSRM /match → road geometry
 * Falls back to the original coords silently on any network / parse error.
 */

const OSRM_MATCH = 'https://router.project-osrm.org/match/v1/driving';
const BATCH_SIZE = 90;       // OSRM limit is 100; stay under for safety
const SNAP_RADIUS_M = 25;    // max metres a point can stray from the road
const TIMEOUT_MS = 8000;

export interface LatLng {
  latitude: number;
  longitude: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.latitude - a.latitude) * (Math.PI / 180);
  const dLng = (b.longitude - a.longitude) * (Math.PI / 180);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * (Math.PI / 180)) *
      Math.cos(b.latitude * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Spatial decimation — keeps only points at least minDistM metres apart.
 * Reduces waypoint count while preserving the shape of the path.
 * Always includes the last point so the route never falls short.
 */
function decimate(coords: LatLng[], minDistM: number): LatLng[] {
  if (coords.length === 0) return coords;
  const out: LatLng[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (haversineM(out[out.length - 1], coords[i]) >= minDistM) {
      out.push(coords[i]);
    }
  }
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

async function matchBatch(coords: LatLng[]): Promise<LatLng[]> {
  const coordStr = coords.map(c => `${c.longitude},${c.latitude}`).join(';');
  const radii = Array(coords.length).fill(SNAP_RADIUS_M).join(';');
  const url =
    `${OSRM_MATCH}/${coordStr}` +
    `?overview=full&geometries=geojson&radiuses=${radii}&tidy=true`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) return coords;

  const json = await res.json();
  if (json.code !== 'Ok' || !json.matchings?.length) return coords;

  return json.matchings.flatMap((m: any) =>
    (m.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }))
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Snaps an array of GPS coordinates onto the road network.
 * Returns snapped coords, or the original array on any failure.
 *
 * - Decimates to ≥20 m spacing before sending to reduce API calls.
 * - Splits routes > 90 waypoints into overlapping batches automatically.
 */
export async function snapToRoads(coords: LatLng[]): Promise<LatLng[]> {
  if (coords.length < 2) return coords;

  const pts = decimate(coords, 20);
  if (pts.length < 2) return coords;

  try {
    if (pts.length <= BATCH_SIZE) {
      return await matchBatch(pts);
    }

    // Long route: process in overlapping batches for a seamless join at seams
    const result: LatLng[] = [];
    let i = 0;
    while (i < pts.length) {
      const batch = pts.slice(i, i + BATCH_SIZE);
      const snapped = await matchBatch(batch);
      result.push(...(result.length === 0 ? snapped : snapped.slice(1)));
      i += BATCH_SIZE - 5; // 5-point overlap keeps the path continuous
    }
    return result.length > 0 ? result : coords;
  } catch {
    return coords;
  }
}
