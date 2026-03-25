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
import { Map as MapView, Camera, UserLocation, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import { MAP_STYLE } from '@constants/mapStyle';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import { useTranslation } from 'react-i18next';
import { useLocationStore } from '@stores/locationStore';
import { useFriendsStore } from '@stores/friendsStore';
import { useDailySummary } from '@hooks/useDailySummary';
import { useTimeline } from '@hooks/useTimeline';
import { useRealtimeFriends } from '@hooks/useRealtimeFriends';
import { initPublisher, stopPublisher } from '@services/friendLocationPublisher';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS, SHADOWS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import LiveIndicator from '@components/ui/LiveIndicator';
import ProgressBar from '@components/ui/ProgressBar';
import RouteLayer from '@components/map/RouteLayer';
import FootstepsLayer from '@components/map/FootstepsLayer';
import { snapToRoads, type LatLng } from '@services/roadSnapper';
import VisitMarker from '@components/map/VisitMarker';
import FriendMarker from '@components/map/FriendMarker';

const { width } = Dimensions.get('window');

function getGreetingKey(): 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening' {
  const h = new Date().getHours();
  if (h < 12) return 'greeting.morning';
  if (h < 18) return 'greeting.afternoon';
  return 'greeting.evening';
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { isTracking, currentSession, recentPoints, lastPoint, trailStyle, setTrailStyle } = useLocationStore();
  const { friends } = useFriendsStore();
  const { summary, distanceMi, progressToGoal } = useDailySummary();
  const { sessions } = useTimeline();
  const { show: showAlert, element: alertElement } = useAlert();
  const { t } = useTranslation();
  const { bottom: safeBottom } = useSafeAreaInsets();
  // Custom tab bar body ≈ 65px + safe area bottom padding
  const scrollPaddingBottom = 65 + Math.max(safeBottom, 10) + 24;

  // Realtime friends subscription
  useRealtimeFriends(user?.id);

  // Start/stop friend location publisher with tracking
  useEffect(() => {
    if (isTracking && user?.id) {
      initPublisher(user.id, user.username ?? undefined);
    } else {
      stopPublisher();
    }
  }, [isTracking, user?.id, user?.username]);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [fullscreenInitCenter, setFullscreenInitCenter] = useState<[number, number]>(() =>
    lastPoint ? [lastPoint.lng, lastPoint.lat] : [-122.4194, 37.7749]
  );
  const [is3D, setIs3D] = useState(false);
  const cameraRef = useRef<CameraRef>(null);
  const fullscreenCameraRef = useRef<CameraRef>(null);

  const flyToUser = () => {
    if (!lastPoint || !fullscreenCameraRef.current) return;
    fullscreenCameraRef.current.flyTo({
      center: [lastPoint.lng, lastPoint.lat],
      zoom: 16,
      duration: 600,
    });
  };

  const firstName = user?.displayName?.split(' ')[0] ?? 'Explorer';
  const progressPct = Math.round(progressToGoal * 100);
  const currentPlace = currentSession?.placeName ?? null;
  const timeOutside = summary ? formatDuration(summary.timeOutsideMin) : '—';
  const placesVisited = summary?.placesVisited ?? sessions.length;

  // Filter consecutive points < 8m apart to remove GPS jitter from the visual route
  const routeCoords = recentPoints.reduce<LatLng[]>((acc, p) => {
    if (acc.length === 0) { acc.push({ latitude: p.lat, longitude: p.lng }); return acc; }
    const prev = acc[acc.length - 1];
    const dLat = (p.lat - prev.latitude) * Math.PI / 180;
    const dLng = (p.lng - prev.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.latitude * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist >= 8) acc.push({ latitude: p.lat, longitude: p.lng });
    return acc;
  }, []);

  // Road-snapped version of the route (updated 3 s after the last new GPS point)
  const [snappedCoords, setSnappedCoords] = useState<LatLng[]>([]);
  const [snapSucceeded, setSnapSucceeded] = useState(false);
  const routeCoordsRef = useRef(routeCoords);
  routeCoordsRef.current = routeCoords;
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    if (routeCoords.length < 2) { setSnappedCoords([]); setSnapSucceeded(false); return; }
    snapTimerRef.current = setTimeout(() => {
      snapToRoads(routeCoordsRef.current).then(({ coords, snapped }) => {
        setSnappedCoords(coords);
        setSnapSucceeded(snapped);
      });
    }, 3000);
    return () => { if (snapTimerRef.current) clearTimeout(snapTimerRef.current); };
  }, [recentPoints.length]);

  // When offline/snapping failed: always show live raw GPS (no stale freeze)
  // When snapping succeeded: show road-snapped path
  const displayCoords = snapSucceeded && snappedCoords.length >= 2 ? snappedCoords : routeCoords;

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
      cameraRef.current.flyTo({
        center: [lastPoint.lng, lastPoint.lat],
        zoom: 14,
        duration: 800,
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: scrollPaddingBottom }]}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <SectionLabel
                  text={isTracking ? '● LIVE TRACKING' : 'TRACKING OFF'}
                  color={isTracking ? COLORS.success : COLORS.textMuted}
                />
                <Text style={styles.greeting}>
                  {t(getGreetingKey())},{'\n'}
                  <Text style={styles.greetingName}>{firstName}</Text>
                </Text>
              </View>
              <View style={styles.headerBtns}>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => router.push('/friends')}
                  activeOpacity={0.75}
                >
                  <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.headerIconBorder} />
                  <Ionicons name="people-outline" size={20} color={COLORS.textSecondary} />
                  {friends.length > 0 && (
                    <View style={styles.friendsBadge}>
                      <Text style={styles.friendsBadgeText}>{friends.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => showAlert({
                    title: t('home.notifications'),
                    message: t('home.noNotifications'),
                    icon: 'notifications-outline',
                    iconColor: COLORS.primary,
                  })}
                  activeOpacity={0.75}
                >
                  <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.headerIconBorder} />
                  <Ionicons name="notifications-outline" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Map Hero Card ── */}
            <View style={styles.mapCard}>
              <MapView
                style={styles.map}
                mapStyle={MAP_STYLE}
                dragPan={false}
                touchPitch={false}
                touchRotate={false}
                touchAndDoubleTapZoom={false}
                attribution={false}
                logo={false}
              >
                <Camera
                  ref={cameraRef}
                  center={centerCoord}
                  zoom={13}
                  pitch={is3D ? 45 : 0}
                />
                {isTracking && <UserLocation />}
                {trailStyle === 'lines'
  ? <RouteLayer allCoords={displayCoords} visibleCoords={displayCoords} />
  : <FootstepsLayer coords={routeCoords} />
}
                {is3D && (
                  <Layer
                    id="3d-buildings"
                    type="fill-extrusion"
                    source="openmaptiles"
                    {...{ 'source-layer': 'building' }}
                    filter={['has', 'render_height']}
                    paint={{
                      'fill-extrusion-color': '#1a1a2e',
                      'fill-extrusion-height': ['get', 'render_height'],
                      'fill-extrusion-base': ['get', 'render_min_height'],
                      'fill-extrusion-opacity': 0.82,
                    }}
                  />
                )}
                {sessions.slice(0, 5).map((s) => (
                  <VisitMarker
                    key={s.id}
                    session={s}
                    onPress={() => router.push(`/place/${s.id}`)}
                  />
                ))}
                {friends.map((f) => (
                  <FriendMarker key={f.userId} friend={f} />
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
                    label={currentPlace ? currentPlace.toUpperCase() : t('home.live')}
                    color={COLORS.success}
                  />
                ) : (
                  <LiveIndicator label={t('home.tapToStart')} color={COLORS.textMuted} />
                )}
              </View>

              {/* Trail style toggle */}
              <TouchableOpacity
                style={styles.trailToggleBtn}
                onPress={() => setTrailStyle(trailStyle === 'lines' ? 'footsteps' : 'lines')}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.trailToggleBtnBorder} />
                <Ionicons
                  name={trailStyle === 'lines' ? 'footsteps-outline' : 'remove-outline'}
                  size={14}
                  color={COLORS.accent}
                />
                <Text style={styles.trailToggleLabel}>
                  {trailStyle === 'lines' ? 'Footsteps' : 'Lines'}
                </Text>
              </TouchableOpacity>

              {/* 3D toggle (mini map) */}
              <TouchableOpacity
                style={[styles.mapIconBtn, styles.threeDBtn]}
                onPress={() => setIs3D(v => !v)}
                activeOpacity={0.8}
              >
                <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={[styles.mapIconBtnBorder, is3D && styles.mapIconBtnBorderActive]} />
                <Text style={[styles.threeDLabel, is3D && styles.threeDLabelActive]}>3D</Text>
              </TouchableOpacity>

              {/* Expand button */}
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={() => { setFullscreenInitCenter(centerCoord); setMapFullscreen(true); }}
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
                  <Text style={styles.distanceLabel}>{t('home.todayDistance')}</Text>
                  <View style={styles.distanceValueRow}>
                    <Text style={styles.distanceValue}>{distanceMi.toFixed(1)}</Text>
                    <Text style={styles.distanceUnit}>mi</Text>
                  </View>
                  <ProgressBar
                    progress={progressToGoal}
                    label={progressPct > 0 ? `${progressPct}${t('home.dailyGoal')}` : t('home.startMoving')}
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
              <StatTile icon="time-outline" label={t('home.timeOutside')} value={timeOutside} color={COLORS.primary} />
              <StatTile icon="location-outline" label={t('home.places')} value={String(placesVisited)} color={COLORS.accent} />
              <StatTile
                icon="trending-up-outline"
                label={t('home.stepsEst')}
                value={summary?.stepsEstimated ? `${(summary.stepsEstimated / 1000).toFixed(1)}k` : '—'}
                color={COLORS.success}
              />
              <StatTile
                icon="flame-outline"
                label={t('home.activeMin')}
                value={summary ? String(Math.round(summary.timeOutsideMin * 0.6)) : '—'}
                color={COLORS.warning}
              />
            </View>

            {/* ── Recent Places ── */}
            {sessions.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.recentTitle}>{t('home.recentPlaces')}</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/timeline')} activeOpacity={0.7}>
                    <Text style={styles.recentSeeAll}>{t('common.seeAll')}</Text>
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
            attribution={false}
            logo={false}
            touchPitch={is3D}
            touchRotate={is3D}
          >
            <Camera
              ref={fullscreenCameraRef}
              center={fullscreenInitCenter}
              zoom={14}
              pitch={is3D ? 45 : 0}
            />
            {isTracking && <UserLocation />}
            {trailStyle === 'lines'
  ? <RouteLayer allCoords={displayCoords} visibleCoords={displayCoords} />
  : <FootstepsLayer coords={routeCoords} />
}
            {is3D && (
              <Layer
                id="fs-3d-buildings"
                type="fill-extrusion"
                source="openmaptiles"
                {...{ 'source-layer': 'building' }}
                filter={['has', 'render_height']}
                paint={{
                  'fill-extrusion-color': '#1a1a2e',
                  'fill-extrusion-height': ['get', 'render_height'],
                  'fill-extrusion-base': ['get', 'render_min_height'],
                  'fill-extrusion-opacity': 0.82,
                }}
              />
            )}
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
            {friends.map((f) => (
              <FriendMarker key={f.userId} friend={f} />
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

          {lastPoint && (
            <TouchableOpacity
              style={styles.locateBtn}
              onPress={flyToUser}
              activeOpacity={0.8}
            >
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.closeBtnBorder} />
              <Ionicons name="locate" size={20} color={COLORS.accent} />
            </TouchableOpacity>
          )}

          {/* 3D toggle (fullscreen) */}
          <TouchableOpacity
            style={[styles.mapIconBtn, styles.fsThreeDBtn]}
            onPress={() => setIs3D(v => !v)}
            activeOpacity={0.8}
          >
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.mapIconBtnBorder, is3D && styles.mapIconBtnBorderActive]} />
            <Text style={[styles.threeDLabel, is3D && styles.threeDLabelActive]}>3D</Text>
          </TouchableOpacity>
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
  scroll: { paddingHorizontal: SPACING.md },

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
  headerBtns: { flexDirection: 'row', gap: SPACING.xs, marginTop: 4 },
  headerIconBtn: {
    width: 42, height: 42, borderRadius: RADIUS.md, overflow: 'hidden',
    backgroundColor: COLORS.glass, alignItems: 'center', justifyContent: 'center',
  },
  headerIconBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  friendsBadge: {
    position: 'absolute', top: 6, right: 6,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  friendsBadgeText: { color: '#fff', fontSize: 8, fontWeight: FONT.weights.bold },

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
  trailToggleBtn: {
    position: 'absolute', bottom: SPACING.md, right: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: RADIUS.full, overflow: 'hidden',
    backgroundColor: COLORS.glass,
  },
  trailToggleBtnBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accent + '60',
  },
  trailToggleLabel: {
    color: COLORS.accent,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
  },
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
  locateBtn: {
    position: 'absolute',
    bottom: 100,
    right: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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

  // ── 3D toggle shared ──
  mapIconBtn: {
    width: 34, height: 34, borderRadius: RADIUS.md, overflow: 'hidden',
    backgroundColor: COLORS.glass, alignItems: 'center', justifyContent: 'center',
  },
  mapIconBtnBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapIconBtnBorderActive: {
    borderColor: COLORS.accent,
  },
  threeDBtn: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm + 34 + SPACING.xs,
  },
  fsThreeDBtn: {
    position: 'absolute', bottom: 160, right: SPACING.md,
    width: 44, height: 44, borderRadius: RADIUS.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  threeDLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: FONT.weights.bold,
    letterSpacing: 0.5,
  },
  threeDLabelActive: {
    color: COLORS.accent,
  },
});
