/**
 * RouteLayer — renders the GPS route as MapLibre layers.
 * Ghost full route (dim) + visible animated slice (bright) + head dot.
 */
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
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
        <GeoJSONSource id="ghost-route" data={toLine(allCoords)}>
          <Layer
            id="ghost-line"
            type="line"
            paint={{
              'line-color': 'rgba(91,127,255,0.18)',
              'line-width': 3,
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
        </GeoJSONSource>
      )}

      {visibleCoords.length > 1 && (
        <GeoJSONSource id="visible-route" data={toLine(visibleCoords)}>
          {/* Wide soft glow behind the line */}
          <Layer
            id="visible-glow"
            type="line"
            paint={{
              'line-color': COLORS.accent,
              'line-width': 14,
              'line-opacity': 0.18,
              'line-blur': 6,
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
          {/* Bright core line */}
          <Layer
            id="visible-line"
            type="line"
            paint={{
              'line-color': COLORS.accent,
              'line-width': 3.5,
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
          />
        </GeoJSONSource>
      )}

      {head && (
        <GeoJSONSource id="head-dot" data={toPoint(head)}>
          <Layer
            id="head-outer"
            type="circle"
            paint={{
              'circle-radius': 14,
              'circle-color': COLORS.accent,
              'circle-opacity': 0.2,
            }}
          />
          <Layer
            id="head-mid"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': COLORS.accent,
              'circle-opacity': 0.5,
            }}
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
