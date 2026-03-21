/**
 * Live Timeline — shows today's journey as a live scrollable timeline
 * with a floating daily stats bar at the bottom.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTimeline } from '@hooks/useTimeline';
import { useDailySummary } from '@hooks/useDailySummary';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS, LAYOUT } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import TimelineItem from '@components/timeline/TimelineItem';

export default function LiveTimelineScreen() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const { sessions } = useTimeline();
  const { summary, distanceMi } = useDailySummary();

  async function handleShare() {
    const lines = sessions.map((s) => {
      const time = new Date(s.startedAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${time} – ${s.placeName}${s.durationMin ? ` (${s.durationMin}m)` : ''}`;
    });
    await Share.share({
      title: `My timeline for ${today}`,
      message: [`Timeline for ${today}`, '', ...lines].join('\n'),
    }).catch(() => {});
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#06060E', '#0A0A14', '#06060E']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <SectionLabel text="LIVE TIMELINE" color={COLORS.success} />
            <Text style={styles.title}>Today</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/(tabs)/history')}
              activeOpacity={0.75}
            >
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.iconBtnBorder} />
              <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleShare}
              activeOpacity={0.75}
            >
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.iconBtnBorder} />
              <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Timeline ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <LinearGradient colors={GRADIENTS.primary} style={styles.emptyIconGrad}>
                  <Ionicons name="footsteps-outline" size={28} color="#fff" />
                </LinearGradient>
              </View>
              <Text style={styles.emptyText}>Your day is just beginning</Text>
              <Text style={styles.emptySubText}>
                Start moving and your journey will{'\n'}appear here automatically.
              </Text>
            </View>
          ) : (
            sessions.map((session, i) => (
              <TimelineItem
                key={session.id}
                session={session}
                isLast={i === sessions.length - 1}
                isCurrent={i === 0 && !session.endedAt}
              />
            ))
          )}
        </ScrollView>

        {/* ── Daily Stats bar ── */}
        <View style={styles.statsBar}>
          <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(79,110,247,0.10)', 'rgba(79,110,247,0.02)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.statsBarBorder} />

          <View style={styles.statsHeader}>
            <Text style={styles.statsTitle}>DAILY STATS</Text>
            <TouchableOpacity onPress={() => router.push('/insights')} activeOpacity={0.7}>
              <Ionicons name="trending-up-outline" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{distanceMi.toFixed(1)}</Text>
              <Text style={styles.statUnit}>MILES</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{sessions.length}</Text>
              <Text style={styles.statUnit}>STOPS</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary?.pointsCount ?? 0}</Text>
              <Text style={styles.statUnit}>POINTS</Text>
            </View>
          </View>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060E' },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xxl + 4,
    fontWeight: FONT.weights.black,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  scroll: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: SPACING.sm,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
    shadowColor: '#5B7FFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  emptyIconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.bold,
  },
  emptySubText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Stats bar
  statsBar: {
    marginHorizontal: SPACING.md,
    marginBottom: LAYOUT.tabBarHeight,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,20,0.85)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 16,
  },
  statsBarBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(79,110,247,0.25)',
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  statsTitle: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1.2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xl,
    fontWeight: FONT.weights.black,
    letterSpacing: -0.5,
  },
  statUnit: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },
});
