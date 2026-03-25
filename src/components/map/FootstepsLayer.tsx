/**
 * FootstepsLayer — renders the GPS route as alternating left/right footprint
 * marks using short angled LINE segments — pure MapLibre geometry, no emoji.
 *
 * Each "step" is a short diagonal stroke offset to the left or right of the
 * travel direction, angled inward slightly like a real footprint:
 *
 *   travel →
 *      \        ← right foot stroke (offset right, angled inward)
 *          \
 *    /          ← left foot stroke  (offset left,  angled inward)
 *        /
 */
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { COLORS } from '@constants/theme';

interface Coord { latitude: number; longitude: number; }

// ─── Tuning ───────────────────────────────────────────────────────────────────
const STEP_M      = 20;   // distance between consecutive footsteps
const SIDE_M      = 4.5;  // perpendicular offset from path centre
const STROKE_M    = 5.0;  // length of each footstep stroke
const TOE_ANGLE   = 20;   // degrees the toe angles inward toward path centre

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

function bearingDeg(a: Coord, b: Coord): number {
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  return (toDeg(Math.atan2(
    Math.sin(dLng) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng),
  )) + 360) % 360;
}

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

// ─── Footstep stroke generator ────────────────────────────────────────────────

function generateStrokes(coords: Coord[]): GeoJSON.FeatureCollection {
  if (coords.length < 2) return { type: 'FeatureCollection', features: [] };

  const features: GeoJSON.Feature[] = [];
  let accumulated = 0;
  let stepIndex = 0;

  for (let i = 1; i < coords.length; i++) {
    const segLen = haversineM(coords[i - 1], coords[i]);
    const brg = bearingDeg(coords[i - 1], coords[i]);

    let walked = accumulated;
    while (walked + STEP_M <= segLen) {
      const t = (walked + STEP_M - accumulated) / segLen;
      const stepPt: Coord = {
        latitude:  coords[i - 1].latitude  + t * (coords[i].latitude  - coords[i - 1].latitude),
        longitude: coords[i - 1].longitude + t * (coords[i].longitude - coords[i - 1].longitude),
      };

      const isLeft = stepIndex % 2 === 0;
      // Side bearing: 90° left or right of travel direction
      const sideBrg = (brg + (isLeft ? -90 : 90) + 360) % 360;
      // Centre of this footstep, offset sideways from path
      const centre = offsetPoint(stepPt, sideBrg, SIDE_M);

      // Stroke runs diagonally: heel is slightly behind & outward, toe is ahead & inward
      // Left foot: heel toward back-left, toe toward front-right (angles inward)
      // Right foot: heel toward back-right, toe toward front-left
      const inward = isLeft ? 90 : -90;
      const heelBrg = (brg + 180 + (isLeft ? -TOE_ANGLE : TOE_ANGLE) + 360) % 360;
      const toeBrg  = (brg       + (isLeft ?  TOE_ANGLE : -TOE_ANGLE) + 360) % 360;

      const heel = offsetPoint(centre, heelBrg, STROKE_M / 2);
      const toe  = offsetPoint(centre, toeBrg,  STROKE_M / 2);

      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [heel.longitude, heel.latitude],
            [toe.longitude,  toe.latitude],
          ],
        },
      });

      walked += STEP_M;
      stepIndex++;
    }

    accumulated = segLen - (walked - accumulated);
    if (accumulated < 0) accumulated = 0;
  }

  return { type: 'FeatureCollection', features };
}

function toPoint(c: Coord): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FootstepsLayerProps { coords: Coord[]; }

export default function FootstepsLayer({ coords }: FootstepsLayerProps) {
  const strokes = useMemo(() => generateStrokes(coords), [coords]);
  const head = coords.length > 0 ? coords[coords.length - 1] : null;

  return (
    <>
      {coords.length > 1 && (
        <GeoJSONSource id="footsteps-src" data={strokes}>
          {/* Soft glow halo */}
          <Layer
            id="footsteps-glow"
            type="line"
            paint={{
              'line-color': COLORS.accent,
              'line-width': 8,
              'line-opacity': 0.15,
              'line-blur': 4,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          {/* Solid stroke */}
          <Layer
            id="footsteps-stroke"
            type="line"
            paint={{
              'line-color': COLORS.accent,
              'line-width': 3,
              'line-opacity': 0.9,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </GeoJSONSource>
      )}

      {/* Head dot — matches RouteLayer */}
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
