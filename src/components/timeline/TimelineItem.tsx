import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, SPACING, FONT } from '@constants/theme';
import type { VisitSession, PlaceCategory } from '@/types/index';

interface TimelineItemProps {
  session: VisitSession;
  isLast?: boolean;
  isCurrent?: boolean;
}

const CATEGORY_CONFIG: Record<PlaceCategory, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  home:     { icon: 'home',           color: COLORS.primary },
  work:     { icon: 'briefcase',      color: COLORS.accent },
  food:     { icon: 'cafe',           color: COLORS.warning },
  transit:  { icon: 'train',          color: '#A074F7' },
  fitness:  { icon: 'barbell',        color: COLORS.success },
  shopping: { icon: 'bag',            color: '#F774C4' },
  nature:   { icon: 'leaf',           color: COLORS.success },
  other:    { icon: 'location',       color: COLORS.textSecondary },
};

export default function TimelineItem({ session, isLast, isCurrent }: TimelineItemProps) {
  const config = CATEGORY_CONFIG[session.placeCategory] ?? CATEGORY_CONFIG.other;

  const start = new Date(session.startedAt);
  const end = session.endedAt ? new Date(session.endedAt) : null;
  const timeLabel = `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ' – Now'}`;
  const durationLabel = session.durationMin
    ? session.durationMin >= 60
      ? `${Math.floor(session.durationMin / 60)}h ${session.durationMin % 60}m`
      : `${session.durationMin}m`
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => router.push({ pathname: '/place/[id]', params: { id: session.id } })}
      style={styles.row}
    >
      {/* Spine */}
      <View style={styles.spine}>
        {/* Icon circle with glow */}
        <View style={[styles.iconOuter, { shadowColor: config.color }]}>
          <LinearGradient
            colors={[`${config.color}30`, `${config.color}10`]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.iconBorder, { borderColor: `${config.color}60` }]} />
          <Ionicons name={config.icon} size={17} color={config.color} />
        </View>
        {!isLast && (
          <View style={styles.lineWrap}>
            <LinearGradient
              colors={isCurrent
                ? [`${config.color}80`, `${config.color}10`]
                : ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)']}
              style={styles.line}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
          </View>
        )}
      </View>

      {/* Card */}
      <View style={[styles.card, isCurrent && styles.cardCurrent]}>
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
        {/* Color left stripe for current */}
        {isCurrent && (
          <View style={[styles.leftStripe, { backgroundColor: config.color }]} />
        )}
        <LinearGradient
          colors={
            isCurrent
              ? [`${config.color}14`, `${config.color}04`]
              : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)']
          }
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.cardBorder, isCurrent && { borderColor: `${config.color}40` }]} />

        <View style={styles.cardContent}>
          <View style={styles.topRow}>
            <Text style={styles.placeName} numberOfLines={1}>{session.placeName}</Text>
            {isCurrent ? (
              <View style={[styles.liveBadge, { backgroundColor: `${config.color}20`, borderColor: `${config.color}50` }]}>
                <View style={[styles.liveDot, { backgroundColor: config.color }]} />
                <Text style={[styles.liveText, { color: config.color }]}>CURRENT</Text>
              </View>
            ) : (
              <Ionicons name="chevron-forward" size={13} color={COLORS.textMuted} style={{ opacity: 0.5 }} />
            )}
          </View>

          {session.address ? (
            <Text style={styles.address} numberOfLines={1}>{session.address}</Text>
          ) : null}

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={11} color={COLORS.textMuted} />
            <Text style={styles.metaText}>{timeLabel}</Text>
            {durationLabel ? (
              <>
                <View style={styles.metaDivider} />
                <Text style={[styles.metaText, styles.durationText]}>{durationLabel}</Text>
              </>
            ) : null}
            {session.distanceFromPrevM ? (
              <>
                <View style={styles.metaDivider} />
                <Ionicons name="navigate-outline" size={10} color={COLORS.textMuted} />
                <Text style={styles.metaText}>
                  {session.distanceFromPrevM >= 1609
                    ? `${(session.distanceFromPrevM / 1609).toFixed(1)} mi`
                    : `${Math.round(session.distanceFromPrevM)}m`}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    gap: 12,
  },
  spine: {
    alignItems: 'center',
    width: 40,
    paddingTop: 2,
  },
  iconOuter: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 6,
  },
  iconBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
  },
  lineWrap: {
    flex: 1,
    width: 2,
    marginTop: 6,
    marginBottom: -4,
    overflow: 'hidden',
    borderRadius: 1,
  },
  line: {
    flex: 1,
    width: 2,
  },
  card: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  cardCurrent: {
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  leftStripe: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    zIndex: 10,
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    paddingLeft: SPACING.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
    gap: SPACING.xs,
  },
  placeName: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
    flex: 1,
    letterSpacing: 0.1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 9,
    fontWeight: FONT.weights.bold,
    letterSpacing: 0.8,
  },
  address: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  metaText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
  },
  durationText: {
    color: COLORS.textSecondary,
    fontWeight: FONT.weights.medium,
  },
  metaDivider: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.textMuted,
    opacity: 0.5,
  },
});
