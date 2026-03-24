import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import { useMonthHistory } from '@hooks/useMonthHistory';

// Map a distance (meters) to a dot intensity style
function dotIntensity(distanceM: number): 'high' | 'mid' | 'low' {
  if (distanceM >= 6000) return 'high';
  if (distanceM >= 2000) return 'mid';
  return 'low';
}

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const { days, isLoading, year, month, goToPrevMonth, goToNextMonth } = useMonthHistory();
  const [selectedDate, setSelectedDate] = useState<string | null>(
    new Date().toISOString().slice(0, 10)
  );

  const monthName = new Date(year, month).toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
  });

  // Locale-aware short day labels starting Monday
  const dayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(i18n.language, { weekday: 'narrow' })
  );

  // Calendar blanks: week starts Monday (0=Mon…6=Sun)
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const blanks = (firstDow + 6) % 7;

  // Recent days: last 5 with data, newest first
  const recentDays = [...days]
    .reverse()
    .filter((d) => d.summary && !d.isFuture)
    .slice(0, 5);

  const selectedDay = days.find((d) => d.date === selectedDate);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <SectionLabel text={t('history.sectionLabel')} color={COLORS.accent} />
              <Text style={styles.title}>{t('history.calendarTitle')}</Text>
            </View>
            <TouchableOpacity
              style={styles.todayBtn}
              onPress={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
            >
              <Text style={styles.todayBtnText}>{t('history.today')}</Text>
            </TouchableOpacity>
          </View>

          {/* Calendar card */}
          <View style={styles.calendarCard}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.calBorder} />

            {/* Month nav */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={goToPrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>{monthName}</Text>
              <TouchableOpacity onPress={goToNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Day headers */}
            <View style={styles.dayHeaders}>
              {dayLabels.map((d, i) => (
                <Text key={i} style={styles.dayHeader}>{d}</Text>
              ))}
            </View>

            {/* Calendar grid */}
            {isLoading ? (
              <View style={styles.calLoading}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : (
              <View style={styles.calGrid}>
                {Array.from({ length: blanks }).map((_, i) => (
                  <View key={`b${i}`} style={styles.calCell} />
                ))}
                {days.map((day) => {
                  const isSelected = day.date === selectedDate;
                  const hasData = !!day.summary && day.summary.totalDistanceM > 0;
                  const intensity = hasData ? dotIntensity(day.summary!.totalDistanceM) : null;

                  return (
                    <TouchableOpacity
                      key={day.date}
                      style={styles.calCell}
                      onPress={() => !day.isFuture && setSelectedDate(day.date)}
                      disabled={day.isFuture}
                    >
                      <View style={[
                        styles.calDay,
                        day.isToday && styles.calDayToday,
                        isSelected && !day.isToday && styles.calDaySelected,
                      ]}>
                        {day.isToday ? (
                          <LinearGradient colors={GRADIENTS.primary} style={styles.calDayGrad}>
                            <Text style={[styles.calDayText, styles.calDayTextActive]}>{day.day}</Text>
                          </LinearGradient>
                        ) : (
                          <Text style={[
                            styles.calDayText,
                            day.isFuture && styles.calDayTextFuture,
                            hasData && styles.calDayTextHasData,
                            isSelected && styles.calDayTextActive,
                          ]}>
                            {day.day}
                          </Text>
                        )}
                      </View>
                      {hasData && !day.isToday && (
                        <View style={[
                          styles.calDot,
                          intensity === 'high' && styles.calDotHigh,
                          intensity === 'mid' && styles.calDotMid,
                          isSelected && styles.calDotActive,
                        ]} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Selected day preview — always shown for non-future selected days */}
            {selectedDay && !selectedDay.isFuture && (
              <View style={styles.dayPreview}>
                <View style={styles.dayPreviewDivider} />
                {selectedDay.summary ? (
                  <View style={styles.dayPreviewRow}>
                    <View style={styles.dayPreviewStat}>
                      <Text style={styles.dayPreviewValue}>
                        {(selectedDay.summary.totalDistanceM / 1609.34).toFixed(1)}
                      </Text>
                      <Text style={styles.dayPreviewLabel}>{t('history.miles')}</Text>
                    </View>
                    <View style={styles.dayPreviewStat}>
                      <Text style={styles.dayPreviewValue}>{selectedDay.summary.placesVisited}</Text>
                      <Text style={styles.dayPreviewLabel}>{t('history.places')}</Text>
                    </View>
                    <View style={styles.dayPreviewStat}>
                      <Text style={styles.dayPreviewValue}>
                        {(selectedDay.summary.stepsEstimated / 1000).toFixed(1)}k
                      </Text>
                      <Text style={styles.dayPreviewLabel}>{t('history.steps')}</Text>
                    </View>
                    <View style={styles.dayPreviewStat}>
                      <Text style={styles.dayPreviewValue}>
                        {Math.floor(selectedDay.summary.timeOutsideMin / 60)}h
                      </Text>
                      <Text style={styles.dayPreviewLabel}>{t('history.active')}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.dayPreviewEmpty}>{t('history.noData')}</Text>
                )}
              </View>
            )}
          </View>

          {/* Recent days list */}
          <Text style={styles.recentTitle}>{t('history.recentDays')}</Text>
          {recentDays.length === 0 && !isLoading ? (
            <View style={styles.emptyRecent}>
              <Ionicons name="calendar-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>{t('history.noData')}</Text>
              <Text style={styles.emptySubText}>{t('history.noDataSub')}</Text>
            </View>
          ) : (
            recentDays.map((day) => {
              const distMi = (day.summary!.totalDistanceM / 1609.34).toFixed(1);
              const stepsK = (day.summary!.stepsEstimated / 1000).toFixed(1);
              const places = day.summary!.placesVisited;
              const dayLabel = new Date(day.date).toLocaleDateString(i18n.language, { weekday: 'long' });
              const dateLabel = day.isToday
                ? t('history.today')
                : new Date(day.date + 'T00:00:00').toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });

              return (
                <TouchableOpacity
                  key={day.date}
                  style={styles.dayRow}
                  activeOpacity={0.75}
                  onPress={() => setSelectedDate(day.date)}
                >
                  <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.dayRowBorder} />
                  <View style={styles.dayRowContent}>
                    <View style={styles.dayRowLeft}>
                      <Text style={styles.dayRowDate}>{dateLabel}</Text>
                      <Text style={styles.dayRowLabel}>{dayLabel}</Text>
                    </View>
                    <View style={styles.dayRowStats}>
                      <Text style={styles.dayRowDist}>{distMi} {t('history.miUnit')}</Text>
                      <Text style={styles.dayRowSub}>{places} {t('history.places')} · {stepsK}k {t('history.steps')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  title: { color: COLORS.textPrimary, fontSize: FONT.sizes.xxl, fontWeight: FONT.weights.black, marginTop: 4 },
  todayBtn: {
    marginTop: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: `${COLORS.primary}20`,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  todayBtnText: { color: COLORS.primary, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },

  calendarCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
  },
  calBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  monthTitle: { color: COLORS.textPrimary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold },
  dayHeaders: { flexDirection: 'row', marginBottom: SPACING.xs },
  dayHeader: { flex: 1, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.medium },
  calLoading: { height: 180, alignItems: 'center', justifyContent: 'center' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', alignItems: 'center', marginBottom: 6 },
  calDay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  calDayGrad: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  calDayToday: {},
  calDaySelected: { backgroundColor: `${COLORS.primary}20`, borderWidth: 1, borderColor: `${COLORS.primary}50` },
  calDayText: { color: COLORS.textMuted, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.medium },
  calDayTextFuture: { color: COLORS.textMuted, opacity: 0.3 },
  calDayTextHasData: { color: COLORS.textPrimary },
  calDayTextActive: { color: COLORS.textPrimary, fontWeight: FONT.weights.bold },
  calDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted, marginTop: 1 },
  calDotMid: { backgroundColor: COLORS.primary, opacity: 0.6 },
  calDotHigh: { backgroundColor: COLORS.primary, opacity: 1 },
  calDotActive: { backgroundColor: COLORS.accent },

  dayPreview: { marginTop: SPACING.sm },
  dayPreviewDivider: { height: 1, backgroundColor: COLORS.border, marginBottom: SPACING.sm },
  dayPreviewRow: { flexDirection: 'row', justifyContent: 'space-around' },
  dayPreviewStat: { alignItems: 'center' },
  dayPreviewValue: { color: COLORS.textPrimary, fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
  dayPreviewLabel: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, marginTop: 2 },
  dayPreviewEmpty: { color: COLORS.textMuted, fontSize: FONT.sizes.sm, textAlign: 'center', paddingVertical: SPACING.xs },

  recentTitle: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: 4,
  },
  emptyRecent: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.xs },
  emptyText: { color: COLORS.textSecondary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.medium },
  emptySubText: { color: COLORS.textMuted, fontSize: FONT.sizes.sm, textAlign: 'center' },

  dayRow: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.sm,
  },
  dayRowBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  dayRowLeft: { flex: 1 },
  dayRowDate: { color: COLORS.textPrimary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold },
  dayRowLabel: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, marginTop: 2 },
  dayRowStats: { alignItems: 'flex-end' },
  dayRowDist: { color: COLORS.textPrimary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold },
  dayRowSub: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, marginTop: 1 },
});
