/**
 * FriendMarker — renders a friend on the map.
 *
 * Layout (anchor = "bottom", so the pointer tip sits on the coordinate):
 *
 *   @username          ← small pill label above the bubble
 *   ┌──────────┐
 *   │  avatar  │       ← 40×40 circle, coloured ring = movement status
 *   │  name    │       ← first name, truncated
 *   │  ▄▄▄ ⚡  │       ← battery bar (hidden when offline)
 *   └──────────┘
 *       ▼              ← pointer diamond
 *
 * Perf:
 *   - React.memo — only re-renders when the friend object reference changes.
 *   - Position smoothly interpolates to the new lat/lng over 800 ms using
 *     requestAnimationFrame so the marker glides instead of teleporting.
 */
import React, { useState, useEffect, useRef, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Marker } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS } from '@constants/theme';
import type { Friend, MovementStatus } from '@/types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function getLastSeen(updatedAt: string): string {
  const s = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_COLOR: Record<MovementStatus, string> = {
  driving:    COLORS.warning,
  walking:    COLORS.success,
  stationary: COLORS.textMuted,
};

const STATUS_ICON: Record<MovementStatus, string> = {
  driving:    'car',
  walking:    'walk',
  stationary: 'pause-circle',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function BatteryBar({ level, charging }: { level: number; charging?: boolean }) {
  const color = charging
    ? COLORS.success
    : level < 0.2 ? COLORS.error
    : level < 0.4 ? COLORS.warning
    : COLORS.success;
  return (
    <View style={styles.battRow}>
      <View style={styles.battOuter}>
        <View style={[styles.battFill, { width: `${Math.round(level * 100)}%` as any, backgroundColor: color }]} />
      </View>
      {charging && <Ionicons name="flash" size={7} color={COLORS.success} />}
    </View>
  );
}

// ─── Smooth position hook ─────────────────────────────────────────────────────

const ANIM_DURATION = 800; // ms

function useSmoothPosition(lat: number, lng: number) {
  const [pos, setPos] = useState({ lat, lng });
  const fromRef  = useRef({ lat, lng });
  const rafRef   = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to   = { lat, lng };

    // Skip animation if essentially same position (< ~1 m)
    if (Math.abs(to.lat - from.lat) < 0.000009 && Math.abs(to.lng - from.lng) < 0.000009) return;

    // Update ref immediately so a rapid second prop change starts from the right place
    fromRef.current = to;

    const startTime = performance.now();

    const step = (now: number) => {
      const t     = Math.min(1, (now - startTime) / ANIM_DURATION);
      const ease  = 1 - (1 - t) ** 3; // cubic ease-out
      setPos({
        lat: from.lat + (to.lat - from.lat) * ease,
        lng: from.lng + (to.lng - from.lng) * ease,
      });
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [lat, lng]);

  return pos;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FriendMarkerProps {
  friend: Friend;
  onPress?: (friend: Friend) => void;
}

function FriendMarkerInner({ friend, onPress }: FriendMarkerProps) {
  if (!friend.location) return null;

  const { lat, lng, batteryLevel, isCharging, status, updatedAt } = friend.location;
  const pos      = useSmoothPosition(lat, lng);
  const isOffline = Date.now() - new Date(updatedAt).getTime() > 5 * 60 * 1000;

  const ringColor   = isOffline ? COLORS.textMuted : STATUS_COLOR[status];
  const displayName = friend.displayName.split(' ')[0];
  const label       = friend.username ? `@${friend.username}` : displayName;

  return (
    <Marker
      id={`friend-${friend.userId}`}
      lngLat={[pos.lng, pos.lat]}
      anchor="bottom"
    >
      <TouchableOpacity
        onPress={() => onPress?.(friend)}
        activeOpacity={0.85}
        style={[styles.root, isOffline && styles.rootOffline]}
      >
        {/* ── Username label ── */}
        <View style={styles.usernamePill}>
          <Text style={styles.usernameText} numberOfLines={1}>{label}</Text>
        </View>

        {/* ── Bubble ── */}
        <View style={[styles.bubble, { borderColor: ringColor }]}>
          {/* Avatar with status ring */}
          <View style={[styles.avatarRing, { borderColor: ringColor }]}>
            {friend.avatarUrl ? (
              <Image
                source={{ uri: friend.avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.initials}>{getInitials(friend.displayName)}</Text>
              </View>
            )}
          </View>

          {/* Status icon badge */}
          <View style={[styles.statusBadge, { backgroundColor: ringColor + '22', borderColor: ringColor + '55' }]}>
            <Ionicons name={STATUS_ICON[status] as any} size={9} color={ringColor} />
          </View>

          {/* First name */}
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>

          {/* Battery — only when online */}
          {!isOffline && batteryLevel != null && (
            <BatteryBar level={batteryLevel} charging={isCharging} />
          )}

          {/* Last seen — only when offline */}
          {isOffline && (
            <Text style={styles.lastSeen}>{getLastSeen(updatedAt)}</Text>
          )}
        </View>

        {/* ── Pointer ── */}
        <View style={[styles.pointer, { borderColor: ringColor }]} />
      </TouchableOpacity>
    </Marker>
  );
}

// Memoize: only re-render when the friend data actually changes
export default memo(FriendMarkerInner, (prev, next) => {
  const pl = prev.friend.location;
  const nl = next.friend.location;
  return (
    prev.friend.userId      === next.friend.userId      &&
    prev.friend.displayName === next.friend.displayName &&
    prev.friend.username    === next.friend.username    &&
    prev.friend.avatarUrl   === next.friend.avatarUrl   &&
    pl?.lat       === nl?.lat       &&
    pl?.lng       === nl?.lng       &&
    pl?.status    === nl?.status    &&
    pl?.updatedAt === nl?.updatedAt &&
    pl?.batteryLevel  === nl?.batteryLevel &&
    pl?.isCharging    === nl?.isCharging
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const AVATAR_SIZE  = 38;
const BUBBLE_W     = 70;

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  rootOffline: {
    opacity: 0.6,
  },

  // Username pill
  usernamePill: {
    backgroundColor: 'rgba(6,6,14,0.82)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    maxWidth: BUBBLE_W + 16,
  },
  usernameText: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 0.2,
  },

  // Bubble
  bubble: {
    width: BUBBLE_W,
    backgroundColor: 'rgba(10,10,22,0.93)',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    padding: 6,
    alignItems: 'center',
    gap: 3,
  },

  // Avatar
  avatarRing: {
    borderRadius: (AVATAR_SIZE + 4) / 2,
    borderWidth: 2,
    padding: 1,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    backgroundColor: `${COLORS.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: FONT.weights.bold,
  },

  // Status badge (bottom-right of avatar)
  statusBadge: {
    position: 'absolute',
    top: 36,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  name: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: FONT.weights.semibold,
    maxWidth: BUBBLE_W - 12,
  },

  // Battery
  battRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  battOuter: {
    width: 26,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  battFill: {
    height: '100%',
    borderRadius: 2,
  },

  lastSeen: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: FONT.weights.medium,
  },

  // Pointer diamond
  pointer: {
    width: 10,
    height: 10,
    backgroundColor: 'rgba(10,10,22,0.93)',
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    transform: [{ rotate: '45deg' }],
    marginTop: -6,
  },
});
