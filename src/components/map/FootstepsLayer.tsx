/**
 * FootstepsLayer — renders the GPS route as footprint icons spaced every
 * STEP_M metres, each rotated to face the direction of travel.
 *
 * Each icon fades + scales in on mount (spring, native driver).
 * Capped at MAX_VISIBLE most-recent footprints for performance.
 *
 * When `previewLimit` is set (free users), only that many icons are shown.
 * A lock-overlay Marker is placed at the last visible step so the user can
 * tap to upgrade.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '@constants/theme';

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
        transform: [{ rotate: `${rotation}deg` }, { scale: anim }],
      }}
    >
      <Ionicons name="footsteps" size={16} color={COLORS.accent} />
    </Animated.View>
  );
}

// ─── Lock overlay marker ──────────────────────────────────────────────────────

function LockOverlay({ onPress }: { onPress?: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 350,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.lockWrap, { opacity: anim, transform: [{ scale: anim }] }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.lockBtn}>
        <Ionicons name="lock-closed" size={11} color="#FFD700" />
        <Text style={styles.lockText}>Unlock Footsteps 👑</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FootstepsLayerProps {
  coords: Coord[];
  /** If set, only show this many footsteps then render a lock overlay. */
  previewLimit?: number;
  /** Called when the lock overlay is tapped. */
  onLockPress?: () => void;
}

export default function FootstepsLayer({ coords, previewLimit, onLockPress }: FootstepsLayerProps) {
  const steps   = useMemo(() => generateStepPoints(coords), [coords]);
  const pool    = steps.slice(-MAX_VISIBLE);
  const visible = previewLimit != null ? pool.slice(0, previewLimit) : pool;
  const showLock = previewLimit != null && pool.length > previewLimit;
  const lockStep = showLock ? pool[previewLimit - 1] : null;

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

      {lockStep && (
        <Marker
          key="footstep-lock"
          lngLat={[lockStep.lng, lockStep.lat]}
          anchor="bottom"
        >
          <LockOverlay onPress={onLockPress} />
        </Marker>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  lockWrap: {
    marginBottom: 6,
  },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(12,12,24,0.92)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.45)',
  },
  lockText: {
    color: '#FFD700',
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
  },
});
