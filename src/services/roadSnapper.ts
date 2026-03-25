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
const TIMEOUT_MS = 5000;

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

export interface SnapResult {
  coords: LatLng[];
  /** true = OSRM returned road-snapped geometry; false = offline / error, raw GPS used */
  snapped: boolean;
}

/**
 * Snaps an array of GPS coordinates onto the road network.
 * Always resolves — returns { snapped: false } with original coords on any failure
 * so the caller can immediately fall back to live raw GPS without delay.
 */
export async function snapToRoads(coords: LatLng[]): Promise<SnapResult> {
  if (coords.length < 2) return { coords, snapped: false };

  const pts = decimate(coords, 20);
  if (pts.length < 2) return { coords, snapped: false };

  try {
    let result: LatLng[];

    if (pts.length <= BATCH_SIZE) {
      result = await matchBatch(pts);
    } else {
      // Long route: process in overlapping batches for a seamless join at seams
      const merged: LatLng[] = [];
      let i = 0;
      while (i < pts.length) {
        const batch = pts.slice(i, i + BATCH_SIZE);
        const snapped = await matchBatch(batch);
        merged.push(...(merged.length === 0 ? snapped : snapped.slice(1)));
        i += BATCH_SIZE - 5;
      }
      result = merged.length > 0 ? merged : pts;
    }

    // matchBatch returns the same reference on failure — different ref means OSRM responded
    const snapped = result !== pts && result.length > 0;
    return { coords: snapped ? result : coords, snapped };
  } catch {
    return { coords, snapped: false };
  }
}
