/**
 * RouteLayer — renders the GPS route as MapLibre layers.
 * Ghost full route (dim) + visible animated slice (bright) + head dot.
 */
import { ShapeSource, LineLayer, CircleLayer } from '@maplibre/maplibre-react-native';
import { COLORS } from '@constants/theme';

interface Coord {
  latitude: number;
  longitude: number;
}

interface RouteLayerProps {
  allCoords: Coord[];
  visibleCoords: Coord[];
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

export default function RouteLayer({ allCoords, visibleCoords }: RouteLayerProps) {
  const head = visibleCoords.length > 0 ? visibleCoords[visibleCoords.length - 1] : null;

  return (
    <>
      {allCoords.length > 1 && (
        <ShapeSource id="ghost-route" shape={toLine(allCoords)}>
          <LineLayer
            id="ghost-line"
            style={{
              lineColor: 'rgba(91,127,255,0.18)',
              lineWidth: 3,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </ShapeSource>
      )}

      {visibleCoords.length > 1 && (
        <ShapeSource id="visible-route" shape={toLine(visibleCoords)}>
          {/* Wide soft glow behind the line */}
          <LineLayer
            id="visible-glow"
            style={{
              lineColor: COLORS.accent,
              lineWidth: 14,
              lineCap: 'round',
              lineJoin: 'round',
              lineOpacity: 0.18,
              lineBlur: 6,
            }}
          />
          {/* Bright core line */}
          <LineLayer
            id="visible-line"
            style={{
              lineColor: COLORS.accent,
              lineWidth: 3.5,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        </ShapeSource>
      )}

      {head && (
        <ShapeSource id="head-dot" shape={toPoint(head)}>
          <CircleLayer
            id="head-outer"
            style={{
              circleRadius: 14,
              circleColor: COLORS.accent,
              circleOpacity: 0.2,
            }}
          />
          <CircleLayer
            id="head-mid"
            style={{
              circleRadius: 8,
              circleColor: COLORS.accent,
              circleOpacity: 0.5,
            }}
          />
          <CircleLayer
            id="head-inner"
            style={{
              circleRadius: 5,
              circleColor: '#ffffff',
              circleStrokeWidth: 2,
              circleStrokeColor: COLORS.accent,
            }}
          />
        </ShapeSource>
      )}
    </>
  );
}
