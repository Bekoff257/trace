import { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useAlert } from '@components/ui/CustomAlert';
import { MapView, Camera, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native';
import { MAP_STYLE } from '@constants/mapStyle';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import { useLocationStore } from '@stores/locationStore';
import { useDailySummary } from '@hooks/useDailySummary';
import { useTimeline } from '@hooks/useTimeline';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS, SHADOWS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import LiveIndicator from '@components/ui/LiveIndicator';
import ProgressBar from '@components/ui/ProgressBar';
import RouteLayer from '@components/map/RouteLayer';
import VisitMarker from '@components/map/VisitMarker';

const { width } = Dimensions.get('window');

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { isTracking, currentSession, recentPoints, lastPoint } = useLocationStore();
  const { summary, distanceMi, progressToGoal } = useDailySummary();
  const { sessions } = useTimeline();
  const { show: showAlert, element: alertElement } = useAlert();
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const cameraRef = useRef<CameraRef>(null);

  const firstName = user?.displayName?.split(' ')[0] ?? 'Explorer';
  const progressPct = Math.round(progressToGoal * 100);
  const currentPlace = currentSession?.placeName ?? null;
  const timeOutside = summary ? formatDuration(summary.timeOutsideMin) : '—';
  const placesVisited = summary?.placesVisited ?? sessions.length;

  const routeCoords = recentPoints.map((p) => ({ latitude: p.lat, longitude: p.lng }));

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  // Fly camera to latest GPS point
  useEffect(() => {
    if (lastPoint && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [lastPoint.lng, lastPoint.lat],
        zoomLevel: 14,
        animationDuration: 800,
      });
    }
  }, [lastPoint?.lat, lastPoint?.lng]);

  const centerCoord: [number, number] = lastPoint
    ? [lastPoint.lng, lastPoint.lat]
    : [-122.4194, 37.7749];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#06060E', '#0A0A14', '#06060E']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <SectionLabel
                  text={isTracking ? '● LIVE TRACKING' : 'TRACKING OFF'}
                  color={isTracking ? COLORS.success : COLORS.textMuted}
                />
                <Text style={styles.greeting}>
                  {getGreeting()},{'\n'}
                  <Text style={styles.greetingName}>{firstName}</Text>
                </Text>
              </View>
              <TouchableOpacity
                style={styles.bellBtn}
                onPress={() => showAlert({
                  title: 'Notifications',
                  message: 'No new notifications.',
                  icon: 'notifications-outline',
                  iconColor: COLORS.primary,
                })}
                activeOpacity={0.75}
              >
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.bellBorder} />
                <Ionicons name="notifications-outline" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Map Hero Card ── */}
            <View style={styles.mapCard}>
              <MapView
                style={styles.map}
                mapStyle={MAP_STYLE}
                scrollEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                zoomEnabled={false}
                attributionEnabled={false}
                logoEnabled={false}
              >
                <Camera
                  ref={cameraRef}
                  centerCoordinate={centerCoord}
                  zoomLevel={13}
                  animationDuration={0}
                />
                {isTracking && <UserLocation visible renderMode="normal" />}
                <RouteLayer allCoords={routeCoords} visibleCoords={routeCoords} />
                {sessions.slice(0, 5).map((s) => (
                  <VisitMarker
                    key={s.id}
                    session={s}
                    onPress={() => router.push(`/place/${s.id}`)}
                  />
                ))}
              </MapView>

              {/* Gradient fade bottom */}
              <LinearGradient
                colors={['transparent', 'rgba(6,6,14,0.95)']}
                style={styles.mapFade}
                pointerEvents="none"
              />

              {/* Live badge */}
              <View style={styles.mapLiveBadge}>
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.mapLiveBorder} />
                {isTracking ? (
                  <LiveIndicator
                    label={currentPlace ? currentPlace.toUpperCase() : 'LIVE'}
                    color={COLORS.success}
                  />
                ) : (
                  <LiveIndicator label="TAP TO START" color={COLORS.textMuted} />
                )}
              </View>

              {/* Expand button */}
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => setMapFullscreen(true)}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.expandBorder} />
                <Ionicons name="expand-outline" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* ── Distance Card ── */}
            <View style={styles.distanceCard}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              <LinearGradient
                colors={['rgba(91,127,255,0.12)', 'rgba(91,127,255,0.02)']}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.distanceBorder} />
              <View style={styles.distanceRow}>
                <View style={styles.distanceLeft}>
                  <Text style={styles.distanceLabel}>TODAY'S DISTANCE</Text>
                  <View style={styles.distanceValueRow}>
                    <Text style={styles.distanceValue}>{distanceMi.toFixed(1)}</Text>
                    <Text style={styles.distanceUnit}>mi</Text>
                  </View>
                  <ProgressBar
                    progress={progressToGoal}
                    label={progressPct > 0 ? `${progressPct}% of daily goal` : 'Start moving'}
                    height={5}
                    style={styles.progressBar}
                  />
                </View>
                <View style={styles.distanceIcon}>
                  <LinearGradient colors={GRADIENTS.primary} style={styles.distanceIconGrad}>
                    <Ionicons name="footsteps-outline" size={22} color="#fff" />
                  </LinearGradient>
                </View>
              </View>
            </View>

            {/* ── Stats Grid ── */}
            <View style={styles.statsGrid}>
              <StatTile icon="time-outline" label="TIME OUTSIDE" value={timeOutside} color={COLORS.primary} />
              <StatTile icon="location-outline" label="PLACES" value={String(placesVisited)} color={COLORS.accent} />
              <StatTile
                icon="trending-up-outline"
                label="STEPS (EST)"
                value={summary?.stepsEstimated ? `${(summary.stepsEstimated / 1000).toFixed(1)}k` : '—'}
                color={COLORS.success}
              />
              <StatTile
                icon="flame-outline"
                label="ACTIVE MIN"
                value={summary ? String(Math.round(summary.timeOutsideMin * 0.6)) : '—'}
                color={COLORS.warning}
              />
            </View>

            {/* ── Recent Places ── */}
            {sessions.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.recentTitle}>RECENT PLACES</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/timeline')} activeOpacity={0.7}>
                    <Text style={styles.recentSeeAll}>See all →</Text>
                  </TouchableOpacity>
                </View>
                {sessions.slice(0, 3).map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.placeRow}
                    onPress={() => router.push(`/place/${s.id}`)}
                    activeOpacity={0.75}
                  >
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.placeRowBorder} />
                    <View style={[styles.placeDot, { backgroundColor: COLORS.primary }]} />
                    <View style={styles.placeInfo}>
                      <Text style={styles.placeName} numberOfLines={1}>{s.placeName}</Text>
                      <Text style={styles.placeTime}>
                        {new Date(s.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {s.durationMin ? ` · ${s.durationMin < 60 ? `${s.durationMin}m` : `${Math.floor(s.durationMin / 60)}h`}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* ── Fullscreen Map Modal ── */}
      <Modal
        visible={mapFullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMapFullscreen(false)}
      >
        <View style={styles.fullscreenMap}>
          <MapView
            style={StyleSheet.absoluteFill}
            mapStyle={MAP_STYLE}
            attributionEnabled={false}
            logoEnabled={false}
          >
            <Camera
              centerCoordinate={centerCoord}
              zoomLevel={14}
              animationDuration={0}
            />
            {isTracking && <UserLocation visible renderMode="normal" />}
            <RouteLayer allCoords={routeCoords} visibleCoords={routeCoords} />
            {sessions.slice(0, 5).map((s) => (
              <VisitMarker
                key={s.id}
                session={s}
                onPress={() => {
                  setMapFullscreen(false);
                  router.push(`/place/${s.id}`);
                }}
              />
            ))}
          </MapView>

          <SafeAreaView edges={['top']} style={styles.fullscreenClose}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setMapFullscreen(false)}
              activeOpacity={0.8}
            >
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.closeBtnBorder} />
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {alertElement}
    </View>
  );
}

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statTile}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[`${color}14`, `${color}04`]} style={StyleSheet.absoluteFill} />
      <View style={styles.statTileBorder} />
      <View style={[styles.statIconWrap, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060E' },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.md, paddingBottom: 110 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  headerLeft: { flex: 1 },
  greeting: { color: COLORS.textSecondary, fontSize: FONT.sizes.md, marginTop: 6, lineHeight: 22 },
  greetingName: { color: COLORS.textPrimary, fontSize: FONT.sizes.xxl, fontWeight: FONT.weights.black, lineHeight: 34 },
  bellBtn: {
    width: 42, height: 42, borderRadius: RADIUS.md, overflow: 'hidden',
    backgroundColor: COLORS.glass, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  bellBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },

  mapCard: {
    height: 220, borderRadius: RADIUS.xl, overflow: 'hidden',
    marginBottom: SPACING.md, backgroundColor: '#0D0D20', ...SHADOWS.strong,
  },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  mapFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 90 },
  mapLiveBadge: {
    position: 'absolute', bottom: SPACING.md, left: SPACING.md,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: RADIUS.full, overflow: 'hidden',
  },
  mapLiveBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  expandBtn: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    width: 34, height: 34, borderRadius: RADIUS.md, overflow: 'hidden',
    backgroundColor: COLORS.glass, alignItems: 'center', justifyContent: 'center',
  },
  expandBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },

  distanceCard: {
    borderRadius: RADIUS.xl, overflow: 'hidden',
    marginBottom: SPACING.md, backgroundColor: COLORS.glass, padding: SPACING.lg,
  },
  distanceBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: 'rgba(91,127,255,0.25)' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  distanceLeft: { flex: 1 },
  distanceLabel: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold, letterSpacing: 1.2, marginBottom: 4 },
  distanceValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.xs, marginBottom: SPACING.sm },
  distanceValue: { color: COLORS.textPrimary, fontSize: 52, fontWeight: FONT.weights.black, lineHeight: 56 },
  distanceUnit: { color: COLORS.textSecondary, fontSize: FONT.sizes.xl, fontWeight: FONT.weights.medium, marginBottom: 8 },
  progressBar: {},
  distanceIcon: { marginLeft: SPACING.md },
  distanceIconGrad: {
    width: 52, height: 52, borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5B7FFF', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.6, shadowRadius: 14, elevation: 10,
  },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  statTile: {
    width: (width - SPACING.md * 2 - SPACING.sm) / 2,
    borderRadius: RADIUS.lg, overflow: 'hidden',
    backgroundColor: COLORS.glass, padding: SPACING.md, gap: 4,
  },
  statTileBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  statIconWrap: { width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { color: COLORS.textPrimary, fontSize: FONT.sizes.xl, fontWeight: FONT.weights.black },
  statLabel: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold, letterSpacing: 0.8 },

  recentSection: { marginBottom: SPACING.md },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  recentTitle: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold, letterSpacing: 1.2 },
  recentSeeAll: { color: COLORS.primary, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.medium },
  placeRow: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.md,
    borderRadius: RADIUS.lg, overflow: 'hidden',
    backgroundColor: COLORS.glass, marginBottom: SPACING.xs, gap: SPACING.sm,
  },
  placeRowBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  placeDot: { width: 8, height: 8, borderRadius: 4 },
  placeInfo: { flex: 1 },
  placeName: { color: COLORS.textPrimary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold },
  placeTime: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, marginTop: 2 },

  fullscreenMap: { flex: 1, backgroundColor: '#06060E' },
  fullscreenClose: { position: 'absolute', top: 0, left: 0, right: 0 },
  closeBtn: {
    margin: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});
