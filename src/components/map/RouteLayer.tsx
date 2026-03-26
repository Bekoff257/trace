/**
 * RouteLayer — renders the GPS route as one GeoJSON source per continuous
 * path segment. Segments are split wherever there is a > 30 s GPS gap so the
 * map never draws a straight line across a gap in coverage.
 *
 * Each source gets a stable key derived from its segment index, so React
 * updates the `data` prop in-place on every GPS point rather than remounting.
 * A `_${seg.length}` suffix on the source ID forces MapLibre to treat updated
 * data as a fresh geometry, guaranteeing real-time re-render.
 */
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { COLORS } from '@constants/theme';

interface Coord {
  latitude: number;
  longitude: number;
}

interface RouteLayerProps {
  /** Path broken into continuous segments. Each segment is rendered separately. */
  segments: Coord[][];
  /**
   * Whether to render the head dot at the tip of the route.
   * Pass false when UserLocation is already visible on the map to avoid
   * a double-dot at the current position. Defaults to true.
   */
  showHead?: boolean;
}

function toLine(coords: Coord[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords.map((c) => [c.longitude, c.latitude]),
    },
  };
}

function toPoint(coord: Coord): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Point',
      coordinates: [coord.longitude, coord.latitude],
    },
  };
}

export default function RouteLayer({ segments, showHead = true }: RouteLayerProps) {
  const validSegments = segments.filter((s) => s.length > 1);

  // Head dot: last point of last valid segment (hidden when UserLocation is shown)
  const lastSeg = validSegments[validSegments.length - 1];
  const head = showHead && lastSeg ? lastSeg[lastSeg.length - 1] : null;

  return (
    <>
      {validSegments.map((seg, i) => (
        // Stable ID — MapLibre GeoJSONSource updates data in-place via the native
        // bridge when the `data` prop changes. Changing the ID would throw inside
        // useFrozenId and crash the JS thread.
        <GeoJSONSource
          key={`seg-${i}`}
          id={`route-seg-${i}`}
          data={toLine(seg)}
        >
          {/* Soft glow */}
          <Layer
            id={`seg-glow-${i}`}
            type="line"
            paint={{
              'line-color': COLORS.accent,
              'line-width': 14,
              'line-opacity': 0.18,
              'line-blur': 6,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          {/* Bright core */}
          <Layer
            id={`seg-line-${i}`}
            type="line"
            paint={{
              'line-color': COLORS.accent,
              'line-width': 3.5,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </GeoJSONSource>
      ))}

      {head && (
        <GeoJSONSource id="head-dot" data={toPoint(head)}>
          <Layer
            id="head-outer"
            type="circle"
            paint={{ 'circle-radius': 14, 'circle-color': COLORS.accent, 'circle-opacity': 0.2 }}
          />
          <Layer
            id="head-mid"
            type="circle"
            paint={{ 'circle-radius': 8, 'circle-color': COLORS.accent, 'circle-opacity': 0.5 }}
          />
          <Layer
            id="head-inner"
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
