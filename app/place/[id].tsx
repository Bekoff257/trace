import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Share, Linking, ActivityIndicator, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS } from '@constants/theme';
import StatCard from '@components/ui/StatCard';
import { useAuthStore } from '@stores/authStore';
import { getSessionById, getSessionsByPlaceName } from '@services/localDB';
import type { VisitSession, PlaceCategory } from '@/types/index';

const { width } = Dimensions.get('window');

const CATEGORY_META: Record<PlaceCategory, { label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  home:     { label: 'HOME',     icon: 'home-outline',       color: COLORS.primary },
  work:     { label: 'WORK',     icon: 'briefcase-outline',  color: COLORS.accent  },
  food:     { label: 'CAFÉ / RESTAURANT', icon: 'cafe-outline', color: COLORS.warning },
  transit:  { label: 'TRANSIT', icon: 'train-outline',      color: COLORS.accent  },
  fitness:  { label: 'FITNESS', icon: 'fitness-outline',    color: COLORS.success },
  shopping: { label: 'SHOPPING', icon: 'bag-outline',       color: '#A78BFA'      },
  nature:   { label: 'NATURE',  icon: 'leaf-outline',       color: COLORS.success },
  other:    { label: 'PLACE',   icon: 'location-outline',   color: COLORS.textSecondary },
};

function formatDuration(min: number | undefined): string {
  if (!min) return '—';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return `Today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function PlaceDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const [session, setSession] = useState<VisitSession | null>(null);
  const [allVisits, setAllVisits] = useState<VisitSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id || !user?.id) return;
    setIsLoading(true);
    getSessionById(id).then(async (s) => {
      setSession(s);
      if (s) {
        const visits = await getSessionsByPlaceName(user.id, s.placeName);
        setAllVisits(visits);
      }
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [id, user?.id]);

  const meta = CATEGORY_META[session?.placeCategory ?? 'other'];
  const totalVisits = allVisits.length;
  const avgDurationMin = allVisits.length > 0
    ? Math.round(allVisits.reduce((a, s) => a + (s.durationMin ?? 0), 0) / allVisits.length)
    : undefined;
  const totalMin = allVisits.reduce((a, s) => a + (s.durationMin ?? 0), 0);

  // 7-day visit frequency (visits per day-of-week, Sun=0)
  const dowCounts = Array(7).fill(0);
  allVisits.forEach((s) => { dowCounts[new Date(s.startedAt).getDay()]++; });
  const maxDow = Math.max(...dowCounts, 1);
  const today = new Date().getDay();

  async function handleDirections() {
    if (!session) return;
    const url = `https://maps.apple.com/?daddr=${session.lat},${session.lng}&dirflg=d`;
    const androidUrl = `geo:${session.lat},${session.lng}?q=${session.lat},${session.lng}(${encodeURIComponent(session.placeName)})`;
    const canMaps = await Linking.canOpenURL('maps:');
    const target = canMaps ? url : androidUrl;
    Linking.openURL(target).catch(() =>
      Alert.alert('Error', 'Could not open Maps.')
    );
  }

  async function handleShare() {
    if (!session) return;
    try {
      await Share.share({
        title: session.placeName,
        message: `${session.placeName}${session.address ? `\n${session.address}` : ''}\nhttps://maps.apple.com/?ll=${session.lat},${session.lng}`,
      });
    } catch {
      // user cancelled or share failed
    }
  }

  function handleSave() {
    Alert.alert('Saved', `${session?.placeName ?? 'Place'} has been bookmarked.`);
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      {/* Map preview header */}
      <View style={styles.mapHeader}>
        <LinearGradient colors={['#0D0D20', '#0A0A18']} style={StyleSheet.absoluteFill} />
        {[0.3, 0.6].map((p, i) => (
          <View key={`h${i}`} style={[styles.gridLine, { top: `${p * 100}%` as any, left: 0, right: 0, height: 1 }]} />
        ))}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <View key={`v${i}`} style={[styles.gridLine, { left: `${p * 100}%` as any, top: 0, bottom: 0, width: 1 }]} />
        ))}
        <View style={styles.pin}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.pinGrad}>
            <Ionicons name={meta.icon} size={20} color={COLORS.textPrimary} />
          </LinearGradient>
          <View style={styles.pinGlow} />
        </View>
        <LinearGradient colors={['transparent', COLORS.background]} style={styles.mapFade} />
      </View>

      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.backBorder} />
          <Ionicons name="arrow-back" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : !session ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.notFound}>Place not found</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          style={styles.scrollContainer}
        >
          {/* Place header */}
          <View style={styles.placeHeader}>
            <View style={[styles.categoryBadge, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}40` }]}>
              <Ionicons name={meta.icon} size={14} color={meta.color} />
              <Text style={[styles.categoryText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <Text style={styles.placeName}>{session.placeName}</Text>
            {session.address ? (
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.address}>{session.address}</Text>
              </View>
            ) : null}
          </View>

          {/* Stats grid */}
          <View style={styles.statsGrid}>
            <StatCard
              icon="repeat"
              iconColor={COLORS.primary}
              label="TOTAL VISITS"
              value={String(totalVisits)}
              style={styles.statItem}
            />
            <StatCard
              icon="time-outline"
              iconColor={COLORS.accent}
              label="AVG DURATION"
              value={formatDuration(avgDurationMin)}
              style={styles.statItem}
            />
            <StatCard
              icon="calendar-outline"
              iconColor={COLORS.success}
              label="LAST VISIT"
              value={formatDate(session.startedAt)}
              style={styles.statItem}
            />
            <StatCard
              icon="hourglass-outline"
              iconColor={COLORS.warning}
              label="TOTAL TIME"
              value={formatDuration(totalMin)}
              style={styles.statItem}
            />
          </View>

          {/* Visit frequency */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>VISIT FREQUENCY BY DAY</Text>
            <View style={styles.freqCard}>
              <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.freqBorder} />
              <View style={styles.freqBars}>
                {dowCounts.map((count, i) => (
                  <LinearGradient
                    key={i}
                    colors={i === today ? GRADIENTS.primary : ['rgba(79,110,247,0.3)', 'rgba(79,110,247,0.08)']}
                    style={[styles.freqBar, { height: Math.max((count / maxDow) * 60, count > 0 ? 4 : 1) }]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                  />
                ))}
              </View>
              <View style={styles.freqLabels}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                  <Text key={i} style={[styles.freqLabel, i === today && styles.freqLabelActive]}>{d}</Text>
                ))}
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleDirections} activeOpacity={0.75}>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.actionBorder} />
              <Ionicons name="navigate-outline" size={18} color={COLORS.primary} />
              <Text style={styles.actionLabel}>Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.75}>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.actionBorder} />
              <Ionicons name="share-outline" size={18} color={COLORS.accent} />
              <Text style={styles.actionLabel}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleSave} activeOpacity={0.75}>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.actionBorder} />
              <Ionicons name="bookmark-outline" size={18} color={COLORS.warning} />
              <Text style={styles.actionLabel}>Save</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  mapHeader: { height: 260, overflow: 'hidden', position: 'relative' },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.04)' },
  pin: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    marginLeft: -24,
    marginTop: -24,
    alignItems: 'center',
  },
  pinGrad: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  pinGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryGlow,
    zIndex: -1,
  },
  mapFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  safe: { position: 'absolute', top: 0, left: 0, right: 0 },
  backBtn: {
    margin: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { color: COLORS.textMuted, fontSize: FONT.sizes.md },
  scrollContainer: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },

  placeHeader: { marginBottom: SPACING.lg },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    marginBottom: SPACING.xs,
  },
  categoryText: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold, letterSpacing: 0.5 },
  placeName: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xxl,
    fontWeight: FONT.weights.black,
    marginBottom: SPACING.xs,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { color: COLORS.textMuted, fontSize: FONT.sizes.sm, flex: 1 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.lg },
  statItem: { width: (width - SPACING.md * 2 - SPACING.xs) / 2 },

  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  freqCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    padding: SPACING.md,
    height: 110,
    justifyContent: 'flex-end',
  },
  freqBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  freqBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 64,
    marginBottom: 8,
  },
  freqBar: { flex: 1, borderRadius: RADIUS.xs },
  freqLabels: { flexDirection: 'row', gap: 6 },
  freqLabel: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: FONT.weights.medium,
  },
  freqLabelActive: { color: COLORS.primary, fontWeight: FONT.weights.bold },

  actions: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: 6,
  },
  actionBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionLabel: { color: COLORS.textSecondary, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.medium },
});
