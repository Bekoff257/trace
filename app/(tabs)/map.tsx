/**
 * Live Timeline — shows today's journey as a live scrollable timeline
 * with a floating daily stats bar at the bottom.
 */
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTimeline } from '@hooks/useTimeline';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import TimelineItem from '@components/timeline/TimelineItem';

export default function LiveTimelineScreen() {
  const { t, i18n } = useTranslation();
  const today = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const { sessions } = useTimeline();

  async function handleShare() {
    const lines = sessions.map((s) => {
      const time = new Date(s.startedAt).toLocaleTimeString(i18n.language, {
        hour: 'numeric',
        minute: '2-digit',
      });
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

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <SectionLabel text={t('timeline.sectionLabel')} color={COLORS.success} />
            <Text style={styles.title}>{t('timeline.title')}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/replay' as any)}
              activeOpacity={0.75}
            >
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.iconBtnBorder} />
              <Ionicons name="play-circle-outline" size={18} color={COLORS.accent} />
            </TouchableOpacity>
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
        </ScrollView>


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

});
