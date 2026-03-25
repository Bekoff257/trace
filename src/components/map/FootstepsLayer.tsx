/**
 * FootstepsLayer — renders the GPS route as footprint icons spaced every
 * STEP_M metres, each rotated to face the direction of travel.
 *
 * Each icon fades + scales in on mount (spring, native driver).
 * Capped at MAX_VISIBLE most-recent footprints for performance.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import { View, Animated } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@constants/theme';

interface Coord { latitude: number; longitude: number; }

// ─── Tuning ───────────────────────────────────────────────────────────────────
const STEP_M      = 25;   // metres between footprint icons
const MAX_VISIBLE = 60;   // cap to keep native view count bounded

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

// ─── Step point generator ─────────────────────────────────────────────────────

interface StepPoint { lat: number; lng: number; rotation: number; }

function generateStepPoints(coords: Coord[]): StepPoint[] {
  if (coords.length < 2) return [];

  const points: StepPoint[] = [];
  let accumulated = 0;

  for (let i = 1; i < coords.length; i++) {
    const segLen = haversineM(coords[i - 1], coords[i]);
    const brg    = bearingDeg(coords[i - 1], coords[i]);

    let walked = accumulated;
    while (walked + STEP_M <= segLen) {
      const t = (walked + STEP_M - accumulated) / segLen;
      points.push({
        lat:      coords[i - 1].latitude  + t * (coords[i].latitude  - coords[i - 1].latitude),
        lng:      coords[i - 1].longitude + t * (coords[i].longitude - coords[i - 1].longitude),
        rotation: brg,
      });
      walked += STEP_M;
    }

    accumulated = segLen - (walked - accumulated);
    if (accumulated < 0) accumulated = 0;
  }

  return points;
}

// ─── Animated footstep icon ───────────────────────────────────────────────────

function FootstepIcon({ rotation }: { rotation: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 160,
      friction: 10,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { rotate: `${rotation}deg` },
          { scale: anim },
        ],
      }}
    >
      <Ionicons name="footsteps" size={16} color={COLORS.accent} />
    </Animated.View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FootstepsLayerProps { coords: Coord[]; }

export default function FootstepsLayer({ coords }: FootstepsLayerProps) {
  const steps   = useMemo(() => generateStepPoints(coords), [coords]);
  const visible = steps.slice(-MAX_VISIBLE);

  return (
    <>
      {visible.map((s) => (
        <Marker
          key={`${s.lat.toFixed(6)},${s.lng.toFixed(6)}`}
          lngLat={[s.lng, s.lat]}
          anchor="center"
        >
          <FootstepIcon rotation={s.rotation} />
        </Marker>
      ))}
    </>
  );
}
