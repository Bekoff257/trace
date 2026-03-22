import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTimeline } from '@hooks/useTimeline';
import { useDailySummary } from '@hooks/useDailySummary';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import TimelineItem from '@components/timeline/TimelineItem';
import ActivityBars from '@components/charts/ActivityBars';

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function TimelineScreen() {
  const { t, i18n } = useTranslation();
  const today = new Date().toLocaleDateString(i18n.language, { weekday: 'long', month: 'long', day: 'numeric' });
  const { sessions } = useTimeline();
  const { summary, distanceMi } = useDailySummary();

  const steps = summary?.stepsEstimated ?? 0;
  const stepsLabel = steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps > 0 ? String(steps) : '—';
  const activeLabel = formatDuration(summary?.timeOutsideMin ?? 0);
  const distLabel = distanceMi > 0 ? `${distanceMi.toFixed(1)} mi` : '—';

  // Build ActivityBars data from sessions (by hour)
  const hourCounts = Array(24).fill(0);
  sessions.forEach((s) => { hourCounts[new Date(s.startedAt).getHours()]++; });
  const dowLabels = ['12a','','','3a','','','6a','','','9a','','','12p','','','3p','','','6p','','','9p','',''];
  const barData = hourCounts.map((v, i) => ({
    label: i % 3 === 0 ? dowLabels[i] : '',
    value: v,
    isToday: new Date().getHours() === i,
  }));

  async function handleShare() {
    const lines = sessions.map((s) => {
      const time = new Date(s.startedAt).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });
      return `${time} – ${s.placeName}${s.durationMin ? ` (${s.durationMin}m)` : ''}`;
    });
    await Share.share({
      title: t('timeline.shareTitle', { date: today }),
      message: [t('timeline.shareMessage', { date: today }), '', ...lines].join('\n'),
    }).catch(() => {});
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#06060E', '#0A0A14', '#06060E']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <SectionLabel text={t('timeline.sectionLabel')} color={COLORS.accent} />
              <Text style={styles.title}>{t('timeline.title')}</Text>
              <Text style={styles.dateLabel}>{today}</Text>
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

          {/* ── Summary Banner ── */}
          <View style={styles.summaryBanner}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(91,127,255,0.12)', 'rgba(0,212,255,0.06)']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.summaryBannerBorder} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{sessions.length}</Text>
              <Text style={styles.summaryLabel}>{t('timeline.places')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{distLabel}</Text>
              <Text style={styles.summaryLabel}>{t('timeline.distance')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{activeLabel}</Text>
              <Text style={styles.summaryLabel}>{t('timeline.outside')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{stepsLabel}</Text>
              <Text style={styles.summaryLabel}>{t('timeline.steps')}</Text>
            </View>
          </View>

          {/* ── Timeline ── */}
          <View style={styles.timelineSection}>
            {sessions.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <LinearGradient colors={GRADIENTS.primary} style={styles.emptyIconGrad}>
                    <Ionicons name="footsteps-outline" size={28} color="#fff" />
                  </LinearGradient>
                </View>
                <Text style={styles.emptyText}>{t('timeline.emptyTitle')}</Text>
                <Text style={styles.emptySubText}>{t('timeline.emptySubtitle')}</Text>
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
          </View>

          {/* ── Activity by Hour ── */}
          <View style={styles.activitySection}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>{t('timeline.activityByHour')}</Text>
              <TouchableOpacity onPress={() => router.push('/insights')} activeOpacity={0.7}>
                <Text style={styles.sectionLink}>{t('common.fullInsights')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.activityCard}>
              <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.activityBorder} />
              <ActivityBars data={barData} color={COLORS.primary} height={72} />
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060E' },
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 110,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xxl + 4,
    fontWeight: FONT.weights.black,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  dateLabel: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.sm,
    marginTop: 2,
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
    backgroundColor: COLORS.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Summary banner
  summaryBanner: {
    flexDirection: 'row',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  summaryBannerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(91,127,255,0.25)',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.black,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.medium,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
  },

  // Timeline
  timelineSection: {
    marginBottom: SPACING.lg,
  },

  // Activity
  activitySection: {
    marginBottom: SPACING.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1.2,
  },
  sectionLink: {
    color: COLORS.primary,
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.medium,
  },
  activityCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    padding: SPACING.md,
  },
  activityBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
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
  emptyIconGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
