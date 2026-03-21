import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, RADIUS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import WeeklyRing from '@components/charts/WeeklyRing';
import ActivityBars from '@components/charts/ActivityBars';
import type { ActivityBar } from '@components/charts/ActivityBars';
import { useInsights, Insight } from '@hooks/useInsights';
import { useAuthStore } from '@stores/authStore';
import { getDailySummary } from '@services/localDB';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function InsightCard({ icon, iconColor, title, body, tag, tagColor }: Omit<Insight, 'id'>) {
  return (
    <View style={styles.insightCard}>
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.insightBorder} />
      <View style={styles.insightContent}>
        <View style={styles.insightTop}>
          <View style={[styles.insightIconWrap, { backgroundColor: `${iconColor}18` }]}>
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
          <View style={[styles.insightTag, { backgroundColor: `${tagColor}18`, borderColor: `${tagColor}40` }]}>
            <Text style={[styles.insightTagText, { color: tagColor }]}>{tag}</Text>
          </View>
        </View>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightBody}>{body}</Text>
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const { user } = useAuthStore();
  const { insights, weeklyScore, isLoading } = useInsights();
  const [weekBars, setWeekBars] = useState<ActivityBar[]>([]);

  // Load 7-day bar data
  useEffect(() => {
    if (!user?.id) return;
    Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return getDailySummary(user.id, d.toISOString().slice(0, 10)).then((s) => ({
          label: DAY_INITIALS[d.getDay()],
          value: s?.totalDistanceM ?? 0,
          isToday: i === 6,
        }));
      })
    ).then(setWeekBars);
  }, [user?.id]);

  const scoreColor = weeklyScore.delta >= 0 ? COLORS.success : COLORS.error;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <SectionLabel text="AI INSIGHTS" color={COLORS.primary} style={styles.pill} />
            <Text style={styles.title}>Your Story</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

            {/* Weekly score card */}
            <View style={styles.scoreCard}>
              <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.scoreBorder} />
              <LinearGradient
                colors={[`${COLORS.primary}25`, 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.scoreContent}>
                {/* Left: text */}
                <View style={styles.scoreLeft}>
                  <Text style={styles.scoreLabel}>WEEKLY ACTIVITY SCORE</Text>
                  <Text style={[styles.scoreSub, { color: scoreColor }]}>{weeklyScore.label}</Text>
                  {weekBars.length > 0 && (
                    <View style={styles.barsWrap}>
                      <ActivityBars data={weekBars} color={COLORS.primary} height={56} />
                    </View>
                  )}
                </View>
                {/* Right: ring */}
                <WeeklyRing score={weeklyScore.score} size={100} stroke={COLORS.primary} />
              </View>
            </View>

            {/* Insight cards */}
            {insights.map((insight) => (
              <InsightCard key={insight.id} {...insight} />
            ))}

          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  pill: { alignSelf: 'center' },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xxl,
    fontWeight: FONT.weights.black,
    marginTop: 2,
  },

  scroll: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },

  scoreCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.md,
  },
  scoreBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  scoreContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  scoreLeft: { flex: 1 },
  scoreLabel: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  scoreSub: { fontSize: FONT.sizes.sm, marginBottom: SPACING.sm },
  barsWrap: { marginTop: SPACING.xs },

  insightCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.sm,
  },
  insightBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  insightContent: { padding: SPACING.md },
  insightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  insightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  insightTagText: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, letterSpacing: 0.5 },
  insightTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
    marginBottom: SPACING.xs,
  },
  insightBody: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.sm,
    lineHeight: 20,
  },
});
