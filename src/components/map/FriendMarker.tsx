/**
 * FriendMarker — renders a friend on the map.
 * Shows: circular avatar (or initials), battery bar, movement icon, last-seen.
 */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Marker } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS } from '@constants/theme';
import type { Friend, MovementStatus } from '@/types/index';

interface FriendMarkerProps {
  friend: Friend;
  onPress?: (friend: Friend) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getLastSeen(updatedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function MovementIcon({ status }: { status: MovementStatus }) {
  const icon =
    status === 'driving' ? 'car' :
    status === 'walking' ? 'walk' :
    'pause-circle';
  const color =
    status === 'driving' ? COLORS.warning :
    status === 'walking' ? COLORS.success :
    COLORS.textMuted;
  return <Ionicons name={icon as any} size={10} color={color} />;
}

function BatteryBar({ level, isCharging }: { level: number; isCharging?: boolean }) {
  const color =
    isCharging ? COLORS.success :
    level < 0.2 ? COLORS.error ?? '#FF4444' :
    level < 0.4 ? COLORS.warning :
    COLORS.success;

  return (
    <View style={styles.batteryWrap}>
      <View style={styles.batteryOuter}>
        <View style={[styles.batteryFill, { width: `${Math.round(level * 100)}%` as any, backgroundColor: color }]} />
      </View>
      {isCharging && (
        <Ionicons name="flash" size={7} color={COLORS.success} style={styles.chargingIcon} />
      )}
    </View>
  );
}

export default function FriendMarker({ friend, onPress }: FriendMarkerProps) {
  if (!friend.location) return null;

  const { lat, lng, batteryLevel, isCharging, status, updatedAt } = friend.location;
  const isOffline = Date.now() - new Date(updatedAt).getTime() > 5 * 60 * 1000; // >5 min

  return (
    <Marker lngLat={[lng, lat]} anchor="bottom">
      <TouchableOpacity
        onPress={() => onPress?.(friend)}
        activeOpacity={0.85}
        style={styles.container}
      >
        {/* Callout bubble */}
        <View style={[styles.bubble, isOffline && styles.bubbleOffline]}>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
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
            {/* Movement status dot */}
            <View style={styles.statusDot}>
              <MovementIcon status={status} />
            </View>
          </View>

          {/* Name */}
          <Text style={styles.name} numberOfLines={1}>
            {friend.displayName.split(' ')[0]}
          </Text>

          {/* Battery */}
          {batteryLevel != null && (
            <BatteryBar level={batteryLevel} isCharging={isCharging} />
          )}

          {/* Last seen (offline) */}
          {isOffline && (
            <Text style={styles.lastSeen}>{getLastSeen(updatedAt)}</Text>
          )}
        </View>

        {/* Pointer */}
        <View style={[styles.pointer, isOffline && styles.pointerOffline]} />
      </TouchableOpacity>
    </Marker>
  );
}

const BUBBLE_W = 72;
const AVATAR_SIZE = 40;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  bubble: {
    width: BUBBLE_W,
    backgroundColor: 'rgba(10,10,22,0.92)',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    padding: 6,
    alignItems: 'center',
    gap: 3,
  },
  bubbleOffline: {
    borderColor: COLORS.textMuted,
    opacity: 0.75,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  avatarPlaceholder: {
    backgroundColor: `${COLORS.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: FONT.weights.bold,
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    backgroundColor: 'rgba(10,10,22,0.9)',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  name: {
    color: COLORS.textPrimary,
    fontSize: 10,
    fontWeight: FONT.weights.semibold,
    maxWidth: BUBBLE_W - 12,
  },
  batteryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  batteryOuter: {
    width: 28,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  batteryFill: {
    height: '100%',
    borderRadius: 3,
  },
  chargingIcon: {
    marginLeft: 1,
  },
  lastSeen: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: FONT.weights.medium,
  },
  pointer: {
    width: 10,
    height: 10,
    backgroundColor: 'rgba(10,10,22,0.92)',
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: COLORS.primary,
    transform: [{ rotate: '45deg' }],
    marginTop: -6,
  },
  pointerOffline: {
    borderColor: COLORS.textMuted,
  },
});
