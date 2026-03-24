/**
 * FootstepsLayer — renders the GPS route as alternating left/right footprint
 * shapes using pure MapLibre circles (no emoji, no images).
 *
 * Each "foot" is two overlapping circles (toe + heel) that together form
 * a foot silhouette, offset perpendicular to the direction of travel.
 *
 *   path direction →
 *   ○ ○        ← right foot (toe + heel circles, offset right)
 *       ○ ○    ← left foot  (toe + heel circles, offset left)
 *           ○ ○← right foot …
 */
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { COLORS } from '@constants/theme';

interface Coord { latitude: number; longitude: number; }

// ─── Tuning ───────────────────────────────────────────────────────────────────
const STEP_M       = 18;   // distance between consecutive footsteps
const SIDE_M       = 3.2;  // perpendicular offset from path centre (left/right)
const HALF_FOOT_M  = 1.6;  // toe/heel are this far ahead/behind the step centre

// ─── Geo helpers ──────────────────────────────────────────────────────────────

function toRad(d: number) { return d * Math.PI / 180; }
function toDeg(r: number) { return r * 180 / Math.PI; }

function haversineM(a: Coord, b: Coord): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Compass bearing (0–360°) from a → b. */
function bearingDeg(a: Coord, b: Coord): number {
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  return (toDeg(Math.atan2(
    Math.sin(dLng) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng),
  )) + 360) % 360;
}

/** Move a point distM metres in bearingDeg direction. */
function offsetPoint(c: Coord, brg: number, distM: number): Coord {
  const R = 6371000;
  const d = distM / R;
  const b = toRad(brg);
  const lat1 = toRad(c.latitude);
  const lng1 = toRad(c.longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(b) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { latitude: toDeg(lat2), longitude: toDeg(lng2) };
}

// ─── Footprint generator ──────────────────────────────────────────────────────

interface FootFeature {
  lng: number;
  lat: number;
  isToe: boolean; // toe = slightly larger radius
}

function generateFootprints(coords: Coord[]): FootFeature[] {
  if (coords.length < 2) return [];
  const features: FootFeature[] = [];
  let accumulated = 0;
  let stepIndex = 0;

  for (let i = 1; i < coords.length; i++) {
    const segLen = haversineM(coords[i - 1], coords[i]);
    const brg = bearingDeg(coords[i - 1], coords[i]);
    const perpBrg = (brg + (stepIndex % 2 === 0 ? 90 : -90)) % 360;

    let walked = accumulated;
    while (walked + STEP_M <= segLen) {
      const t = (walked + STEP_M - accumulated) / segLen; // 0-1 along segment
      // Interpolate position along segment
      const stepPt: Coord = {
        latitude:  coords[i - 1].latitude  + t * (coords[i].latitude  - coords[i - 1].latitude),
        longitude: coords[i - 1].longitude + t * (coords[i].longitude - coords[i - 1].longitude),
      };

      const side = stepIndex % 2 === 0 ? 90 : -90;
      const sidePt = offsetPoint(stepPt, (brg + side + 360) % 360, SIDE_M);

      // Toe circle — slightly ahead in travel direction
      const toePt = offsetPoint(sidePt, brg, HALF_FOOT_M);
      features.push({ lng: toePt.longitude, lat: toePt.latitude, isToe: true });

      // Heel circle — slightly behind
      const heelPt = offsetPoint(sidePt, (brg + 180) % 360, HALF_FOOT_M);
      features.push({ lng: heelPt.longitude, lat: heelPt.latitude, isToe: false });

      walked += STEP_M;
      stepIndex++;
    }

    accumulated = segLen - (walked - accumulated);
    // carry the remainder into the next segment
    if (accumulated < 0) accumulated = 0;
  }

  return features;
}

// ─── GeoJSON builders ─────────────────────────────────────────────────────────

function toFeatureCollection(feats: FootFeature[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: feats.map(f => ({
      type: 'Feature',
      properties: { isToe: f.isToe },
      geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
    })),
  };
}

function toPoint(c: Coord): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FootstepsLayerProps {
  coords: Coord[];
}

export default function FootstepsLayer({ coords }: FootstepsLayerProps) {
  const geojson = useMemo(() => toFeatureCollection(generateFootprints(coords)), [coords]);
  const head = coords.length > 0 ? coords[coords.length - 1] : null;

  return (
    <>
      {coords.length > 1 && (
        <GeoJSONSource id="footsteps-src" data={geojson}>
          {/* Soft glow halo behind each circle */}
          <Layer
            id="footsteps-glow"
            type="circle"
            paint={{
              'circle-radius': ['case', ['get', 'isToe'], 7, 5.5],
              'circle-color': COLORS.accent,
              'circle-opacity': 0.18,
              'circle-blur': 0.6,
            }}
          />
          {/* Solid footprint circle */}
          <Layer
            id="footsteps-dot"
            type="circle"
            paint={{
              'circle-radius': ['case', ['get', 'isToe'], 4, 3],
              'circle-color': COLORS.accent,
              'circle-opacity': 0.85,
            }}
          />
        </GeoJSONSource>
      )}

      {/* Head dot — same as RouteLayer */}
      {head && (
        <GeoJSONSource id="fs-head-dot" data={toPoint(head)}>
          <Layer
            id="fs-head-outer"
            type="circle"
            paint={{ 'circle-radius': 14, 'circle-color': COLORS.accent, 'circle-opacity': 0.2 }}
          />
          <Layer
            id="fs-head-mid"
            type="circle"
            paint={{ 'circle-radius': 8, 'circle-color': COLORS.accent, 'circle-opacity': 0.5 }}
          />
          <Layer
            id="fs-head-inner"
            type="circle"
            paint={{
              'circle-radius': 5,
              'circle-color': '#ffffff',
              'circle-stroke-width': 2,
              'circle-stroke-color': COLORS.accent,
            }}
          />
        </GeoJSONSource>
      )}
    </>
  );
}
