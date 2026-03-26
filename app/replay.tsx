/**
 * Daily Replay — cinematic animated playback of the user's GPS path.
 *
 * Rendering pipeline:
 *   • Dim LineLayer  — full-day path (always visible as grey background)
 *   • Bright LineLayer — visited portion (grows during playback)
 *   • CircleLayer    — animated head dot at interpolated sub-point position
 *   • Camera follows interpolatedHead with bearing + adaptive zoom at 20fps
 *
 * Controls:
 *   • Play / Pause, Restart, scrubber seek
 *   • Speed selector: 1× / 5× / 20×
 *   • 3D toggle (pitch 55° playing / 35° paused)
 *   • Export button → Share.share() with JSON summary
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Animated,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Map as MapView,
  Camera,
  GeoJSONSource,
  Layer,
} from '@maplibre/maplibre-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRouteReplay, type PlaybackSpeed, type ReplayLatLng } from '@hooks/useRouteReplay';
import VisitMarker from '@components/map/VisitMarker';
import PaywallScreen from '@components/ui/PaywallScreen';
import { usePlanStore } from '@stores/planStore';
import { MAP_STYLE } from '@constants/mapStyle';
import { COLORS, FONT, SPACING, RADIUS, SHADOWS } from '@constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEEDS: PlaybackSpeed[] = [1, 5, 20];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDateLabel(dateStr: string): string {
  const today     = localDateString(0);
  const yesterday = localDateString(-1);
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '——';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function formatSpeed(ms: number): string {
  const kmh = ms * 3.6;
  return kmh < 0.5 ? '—' : `${kmh.toFixed(1)} km/h`;
}

/** Convert replay segments to a GeoJSON FeatureCollection. */
function toGeoJSON(segments: ReplayLatLng[][]): object {
  return {
    type: 'FeatureCollection',
    features: segments.map((seg) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: seg.map((p) => [p.longitude, p.latitude]),
      },
    })),
  };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

// Recording steps:
//   idle    → user hasn't started the flow
//   setup   → modal is open, walking through instructions
//   recording → user confirmed recording started, replay is playing
//   done    → replay finished, prompt user to stop recording
type RecordingStep = 'idle' | 'setup' | 'recording' | 'done';

const REC_INSTRUCTIONS = Platform.OS === 'ios'
  ? 'Open Control Center (swipe down from the top-right corner) and tap the Screen Recording button. Wait for the 3-second countdown, then come back here.'
  : 'Pull down your notification shade and tap Screen Record (or Screen Recorder). Some Android devices have it in Quick Settings.';

export default function ReplayScreen() {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const [dateOffset, setDateOffset] = useState(0);
  const [is3D, setIs3D] = useState(false);
  const { userPlan } = usePlanStore();
  const [previewEnded, setPreviewEnded]     = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [recordingStep, setRecordingStep]   = useState<RecordingStep>('idle');
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayAnim     = useRef(new Animated.Value(0)).current;

  // Scrubber
  const trackWidthRef  = useRef(0);
  const totalPointsRef = useRef(0);
  const seekToRef      = useRef<(i: number) => void>(() => {});
  const isPlayingRef   = useRef(false);
  const pauseRef       = useRef<() => void>(() => {});

  const date = localDateString(dateOffset);

  const {
    allSegments,
    visibleSegments,
    interpolatedHead,
    bearing,
    currentSpeedMs,
    cumulativeDistanceM,
    sessions,
    isLoading,
    isPlaying,
    progress,
    totalPoints,
    speed,
    currentTime,
    startTime,
    endTime,
    play,
    pause,
    restart,
    setSpeed,
    seekTo,
    exportReplayData,
  } = useRouteReplay(date);

  // Sync refs for scrubber callbacks
  totalPointsRef.current = totalPoints;
  seekToRef.current      = seekTo;
  isPlayingRef.current   = isPlaying;
  pauseRef.current       = pause;

  // ── GeoJSON memos ──────────────────────────────────────────────────────────

  const allGeoJSON     = useMemo(() => toGeoJSON(allSegments),     [allSegments]);
  const visibleGeoJSON = useMemo(() => toGeoJSON(visibleSegments), [visibleSegments]);

  const headGeoJSON = useMemo(() => {
    if (!interpolatedHead) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [interpolatedHead.longitude, interpolatedHead.latitude],
      },
    };
  }, [interpolatedHead]);

  // ── Camera (computed reactively — no camera state) ─────────────────────────

  const allCoordsFlat = useMemo(
    () => allSegments.flatMap((s) => s),
    [allSegments],
  );

  const overviewCenter = useMemo<[number, number]>(() => {
    if (allCoordsFlat.length === 0) return [0, 0];
    const lats = allCoordsFlat.map((c) => c.latitude);
    const lngs = allCoordsFlat.map((c) => c.longitude);
    return [
      (Math.max(...lngs) + Math.min(...lngs)) / 2,
      (Math.max(...lats) + Math.min(...lats)) / 2,
    ];
  }, [allCoordsFlat]);

  const overviewZoom = useMemo(() => {
    if (allCoordsFlat.length < 2) return 13;
    const lats = allCoordsFlat.map((c) => c.latitude);
    const lngs = allCoordsFlat.map((c) => c.longitude);
    const span = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lngs) - Math.min(...lngs),
    );
    if (span > 0.1) return 11;
    if (span > 0.02) return 13;
    return 15;
  }, [allCoordsFlat]);

  // Computed camera props — reactive, no extra state
  const cameraCenter: [number, number] =
    isPlaying && interpolatedHead
      ? [interpolatedHead.longitude, interpolatedHead.latitude]
      : overviewCenter;

  const cameraZoom = isPlaying
    ? currentSpeedMs > 8 ? 14 : currentSpeedMs > 2 ? 15 : 16
    : overviewZoom;

  const cameraHeading      = isPlaying ? bearing : 0;
  const cameraPitch        = is3D ? (isPlaying ? 55 : 35) : 0;
  const cameraAnimDuration = isPlaying ? 80 : 800;

  // ── Visible sessions (appear as playback reaches them) ─────────────────────

  const visibleSessions = useMemo(
    () => sessions.filter((s) => !currentTime || s.startedAt <= currentTime),
    [sessions, currentTime],
  );

  // ── Session toast ──────────────────────────────────────────────────────────

  const activeSession = useMemo(() => {
    if (!currentTime) return null;
    return (
      sessions
        .filter((s) => s.startedAt <= currentTime)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
    );
  }, [sessions, currentTime]);

  const toastAnim        = useRef(new Animated.Value(0)).current;
  const prevSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSession || activeSession.id === prevSessionIdRef.current) return;
    prevSessionIdRef.current = activeSession.id;
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3500),
      Animated.timing(toastAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [activeSession?.id]);

  // ── Free preview logic ─────────────────────────────────────────────────────

  useEffect(() => {
    setPreviewEnded(false);
    overlayAnim.setValue(0);
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, [date]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (previewEnded) {
      Animated.timing(overlayAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [previewEnded]);

  function handlePlayPress() {
    if (userPlan === 'premium') {
      isPlaying ? pause() : play();
      return;
    }
    if (previewEnded) { setPaywallVisible(true); return; }
    if (isPlaying)    { pause(); return; }
    play();
    if (!previewTimerRef.current) {
      previewTimerRef.current = setTimeout(() => {
        pause();
        setPreviewEnded(true);
        previewTimerRef.current = null;
      }, 3000);
    }
  }

  // ── Video export (guided screen recording) ─────────────────────────────────

  // Pulsing dot animation for the REC badge
  const recPulse = useRef(new Animated.Value(1)).current;
  const recPulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Slide-down banner when replay finishes during recording
  const doneAnim = useRef(new Animated.Value(-80)).current;

  // Start/stop the pulsing animation based on recording state
  useEffect(() => {
    if (recordingStep === 'recording') {
      recPulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recPulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(recPulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ]),
      );
      recPulseLoop.current.start();
    } else {
      recPulseLoop.current?.stop();
      recPulse.setValue(1);
    }
  }, [recordingStep]);

  // When replay finishes while recording, advance to 'done' and slide in banner
  useEffect(() => {
    if (recordingStep === 'recording' && !isPlaying && progress > 0.98) {
      setRecordingStep('done');
      Animated.spring(doneAnim, {
        toValue: 0, useNativeDriver: true, tension: 60, friction: 10,
      }).start();
    }
  }, [recordingStep, isPlaying, progress]);

  // Reset done banner when dismissed
  const handleRecordingDone = useCallback(() => {
    Animated.timing(doneAnim, { toValue: -80, duration: 250, useNativeDriver: true }).start(() => {
      setRecordingStep('idle');
    });
  }, []);

  // Open the setup modal and pause any active playback
  const handleOpenRecordingSetup = useCallback(() => {
    if (isPlaying) pause();
    setRecordingStep('setup');
  }, [isPlaying, pause]);

  // User confirmed they've started screen recording → restart replay from 0
  const handleRecordingReady = useCallback(() => {
    setRecordingStep('recording');
    restart();
  }, [restart]);

  // ── JSON export ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const data = exportReplayData();
    try {
      await Share.share({
        message: JSON.stringify(data, null, 2),
        title:   `Replay ${date}`,
      });
    } catch { /* user cancelled */ }
  }, [exportReplayData, date]);

  // ── Scrubber ───────────────────────────────────────────────────────────────

  const handleScrubberTouch = useCallback((locationX: number) => {
    const w = trackWidthRef.current;
    if (w === 0) return;
    seekToRef.current(Math.round((Math.max(0, Math.min(1, locationX / w))) * totalPointsRef.current));
  }, []);

  const scrubberProps = {
    onLayout: (e: any) => { trackWidthRef.current = e.nativeEvent.layout.width; },
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder:  () => true,
    onResponderGrant: (e: any) => {
      if (isPlayingRef.current) pauseRef.current();
      handleScrubberTouch(e.nativeEvent.locationX);
    },
    onResponderMove: (e: any) => handleScrubberTouch(e.nativeEvent.locationX),
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasData  = !isLoading && totalPoints > 0;
  const noData   = !isLoading && totalPoints === 0;
  const thumbLeft =
    trackWidthRef.current > 0
      ? Math.max(0, Math.min(trackWidthRef.current - 14, progress * trackWidthRef.current - 7))
      : 0;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Full-screen map ── */}
      <MapView
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        attribution={false}
        logo={false}
        touchPitch={is3D}
        touchRotate={is3D}
      >
        <Camera
          center={cameraCenter}
          zoom={cameraZoom}
          bearing={cameraHeading}
          pitch={cameraPitch}
          duration={cameraAnimDuration}
          easing={isPlaying ? 'ease' : 'fly'}
        />

        {/* Dim background — full day path */}
        {hasData && (
          <GeoJSONSource id="rp-all" data={allGeoJSON as any}>
            <Layer
              id="rp-all-line"
              type="line"
              paint={{
                'line-color': 'rgba(255,255,255,0.18)',
                'line-width': 2.5,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* Bright foreground — visited portion */}
        {hasData && (
          <GeoJSONSource id="rp-visible" data={visibleGeoJSON as any}>
            <Layer
              id="rp-visible-line"
              type="line"
              paint={{
                'line-color': COLORS.accent,
                'line-width': 3.5,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}

        {/* Animated head dot */}
        {hasData && headGeoJSON && (
          <GeoJSONSource id="rp-head" data={headGeoJSON as any}>
            <Layer
              id="rp-head-halo"
              type="circle"
              paint={{
                'circle-radius': 12,
                'circle-color': 'rgba(0,212,255,0.25)',
                'circle-blur': 0.6,
              }}
            />
            <Layer
              id="rp-head-dot"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': COLORS.accent,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
              }}
            />
          </GeoJSONSource>
        )}

        {/* 3D buildings */}
        {is3D && hasData && (
          <Layer
            id="rp-buildings"
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

        {visibleSessions.map((s) => (
          <VisitMarker key={s.id} session={s} />
        ))}
      </MapView>

      {/* ── Session toast ── */}
      {activeSession && (
        <Animated.View
          style={[
            styles.sessionToast,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.sessionToastBorder} />
          <Ionicons name="location" size={13} color={COLORS.accent} />
          <Text style={styles.sessionToastText} numberOfLines={1}>
            {activeSession.placeName}
          </Text>
        </Animated.View>
      )}

      {/* ── Free preview ended overlay ── */}
      {previewEnded && userPlan === 'free' && (
        <Animated.View style={[styles.previewOverlay, { opacity: overlayAnim }]} pointerEvents="box-none">
          <View style={styles.previewCard}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.previewCardBorder} />
            <Ionicons name="lock-closed" size={22} color="#FFD700" style={{ marginBottom: SPACING.xs }} />
            <Text style={styles.previewTitle}>Unlock full Replay Mode 👑</Text>
            <Text style={styles.previewSub}>Preview ended — upgrade to watch your full day</Text>
            <TouchableOpacity
              style={styles.previewUpgradeBtn}
              onPress={() => setPaywallVisible(true)}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.previewUpgradeBtnGrad}>
                <Text style={styles.previewUpgradeBtnText}>Upgrade to Premium</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Top bar ── */}
      <SafeAreaView edges={['top']} style={styles.topSafe} pointerEvents="box-none">
        <View style={styles.topBar}>
          {/* Back */}
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.iconBtnBorder} />
            <Ionicons name="chevron-back" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>

          {/* Date picker */}
          <View style={styles.datePill} pointerEvents="box-none">
            <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.iconBtnBorder} />
            <TouchableOpacity
              onPress={() => setDateOffset((d) => Math.max(d - 1, -6))}
              style={styles.dateArrow}
              activeOpacity={0.7}
              disabled={dateOffset <= -6}
            >
              <Ionicons
                name="chevron-back"
                size={15}
                color={dateOffset <= -6 ? COLORS.textMuted : COLORS.textPrimary}
              />
            </TouchableOpacity>
            <Text style={styles.dateLabel}>{formatDateLabel(date)}</Text>
            <TouchableOpacity
              onPress={() => setDateOffset((d) => Math.min(d + 1, 0))}
              style={styles.dateArrow}
              activeOpacity={0.7}
              disabled={dateOffset >= 0}
            >
              <Ionicons
                name="chevron-forward"
                size={15}
                color={dateOffset >= 0 ? COLORS.textMuted : COLORS.textPrimary}
              />
            </TouchableOpacity>
          </View>

          {/* 3D toggle */}
          <TouchableOpacity
            style={[styles.iconBtn, is3D && styles.iconBtnActive]}
            onPress={() => setIs3D((v) => !v)}
            activeOpacity={0.8}
          >
            <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.iconBtnBorder, is3D && styles.iconBtnBorderActive]} />
            <Text style={[styles.threeDText, is3D && styles.threeDTextActive]}>3D</Text>
          </TouchableOpacity>

          {/* Record video / REC badge */}
          {hasData && (
            recordingStep === 'recording' ? (
              /* Pulsing REC badge — replaces button during capture */
              <View style={styles.recBadge}>
                <Animated.View style={[styles.recDot, { opacity: recPulse }]} />
                <Text style={styles.recLabel}>REC</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={handleOpenRecordingSetup}
                activeOpacity={0.8}
                disabled={recordingStep === 'done'}
              >
                <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.iconBtnBorder} />
                <Ionicons name="videocam-outline" size={18} color={COLORS.textPrimary} />
              </TouchableOpacity>
            )
          )}

          {/* JSON share */}
          {hasData && recordingStep === 'idle' && (
            <TouchableOpacity style={styles.iconBtn} onPress={handleExport} activeOpacity={0.8}>
              <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.iconBtnBorder} />
              <Ionicons name="share-outline" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {/* ── "Stop recording" completion banner ── */}
      <Animated.View
        style={[styles.recDoneBanner, { transform: [{ translateY: doneAnim }] }]}
        pointerEvents={recordingStep === 'done' ? 'box-none' : 'none'}
      >
        <BlurView intensity={75} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.recDoneBannerBorder} />
        <View style={styles.recDoneBannerRow}>
          <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
          <Text style={styles.recDoneBannerText}>
            Replay done — stop your screen recording now
          </Text>
          <TouchableOpacity onPress={handleRecordingDone} hitSlop={12}>
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── Guided screen-recording setup modal ── */}
      {recordingStep === 'setup' && (
        <View style={styles.recModal}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.recModalCard}>
            <View style={styles.recModalBorder} />

            {/* Icon */}
            <View style={styles.recModalIcon}>
              <Ionicons name="videocam" size={28} color={COLORS.accent} />
            </View>

            <Text style={styles.recModalTitle}>Record Your Replay</Text>
            <Text style={styles.recModalSub}>
              This app can't record the map directly. Use your device's built-in
              screen recorder, then hit Start Replay here.
            </Text>

            {/* Steps */}
            <View style={styles.recStepList}>
              <View style={styles.recStep}>
                <View style={styles.recStepNum}><Text style={styles.recStepNumText}>1</Text></View>
                <Text style={styles.recStepText}>{REC_INSTRUCTIONS}</Text>
              </View>
              <View style={styles.recStep}>
                <View style={styles.recStepNum}><Text style={styles.recStepNumText}>2</Text></View>
                <Text style={styles.recStepText}>
                  Come back here and tap <Text style={{ color: COLORS.accent, fontWeight: FONT.weights.bold }}>Start Replay</Text>.
                  The route will play from the beginning at 1× speed.
                </Text>
              </View>
              <View style={styles.recStep}>
                <View style={styles.recStepNum}><Text style={styles.recStepNumText}>3</Text></View>
                <Text style={styles.recStepText}>
                  When the replay finishes a banner will remind you to stop recording.
                </Text>
              </View>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.recStartBtn}
              onPress={handleRecordingReady}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#5B7FFF', '#00D4FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.recStartBtnGrad}
              >
                <Ionicons name="play" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.recStartBtnText}>Start Replay</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setRecordingStep('idle')}
              hitSlop={12}
              style={{ marginTop: SPACING.sm }}
            >
              <Text style={styles.recCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <PaywallScreen visible={paywallVisible} onClose={() => setPaywallVisible(false)} />

      {/* ── Controls panel ── */}
      <View style={[styles.panel, { paddingBottom: safeBottom + SPACING.md }]}>
        <LinearGradient
          colors={['transparent', 'rgba(6,6,14,0.92)']}
          style={styles.scrim}
          pointerEvents="none"
        />
        <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.panelTopBorder} />

        <View style={styles.panelInner}>
          {isLoading && (
            <View style={styles.stateRow}>
              <ActivityIndicator color={COLORS.accent} size="small" />
              <Text style={styles.stateText}>Loading route…</Text>
            </View>
          )}

          {noData && (
            <View style={styles.stateRow}>
              <Ionicons name="map-outline" size={18} color={COLORS.textMuted} />
              <Text style={styles.stateText}>No route recorded for this day</Text>
            </View>
          )}

          {hasData && (
            <>
              {/* Stats strip */}
              <View style={styles.statsStrip}>
                <View style={styles.statItem}>
                  <Ionicons name="navigate-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.statValue}>{formatDist(cumulativeDistanceM)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="speedometer-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.statValue}>{formatSpeed(currentSpeedMs)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
                  <Text style={styles.statValue}>{formatTime(currentTime ?? startTime)}</Text>
                </View>
              </View>

              {/* Scrubber */}
              <View style={styles.scrubberWrap} {...scrubberProps}>
                <View style={styles.scrubberTrack} />
                <View style={[styles.scrubberFill, { width: `${Math.min(100, progress * 100)}%` as any }]} />
                <View style={[styles.scrubberGlow, { width: `${Math.min(100, progress * 100)}%` as any }]} />
                <View style={[styles.scrubberThumb, { left: thumbLeft }]} />
              </View>

              {/* Time endpoints */}
              <View style={styles.timeEndRow}>
                <Text style={styles.timeEnd}>{formatTime(startTime)}</Text>
                <Text style={styles.timeEnd}>{formatTime(endTime)}</Text>
              </View>

              {/* Buttons row */}
              <View style={styles.controlRow}>
                <TouchableOpacity style={styles.ctrlBtn} onPress={restart} activeOpacity={0.7}>
                  <Ionicons name="play-skip-back" size={19} color={COLORS.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.playBtn} onPress={handlePlayPress} activeOpacity={0.85}>
                  <LinearGradient
                    colors={['#5B7FFF', '#00D4FF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.playBtnGrad}
                  >
                    <Ionicons
                      name={isPlaying ? 'pause' : 'play'}
                      size={24}
                      color="#fff"
                      style={isPlaying ? undefined : { marginLeft: 2 }}
                    />
                  </LinearGradient>
                </TouchableOpacity>

                <View style={styles.speedRow}>
                  {SPEEDS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.speedBtn, speed === s && styles.speedBtnActive]}
                      onPress={() => setSpeed(s)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.speedLabel, speed === s && styles.speedLabelActive]}>
                        {s}×
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06060E',
  },

  // ── Top bar
  topSafe: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(0,212,255,0.15)',
  },
  iconBtnBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  iconBtnBorderActive: {
    borderColor: COLORS.accent,
  },
  threeDText: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
    letterSpacing: 0.5,
  },
  threeDTextActive: {
    color: COLORS.accent,
  },
  datePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: SPACING.sm,
    gap: SPACING.xs,
  },
  dateArrow: {
    padding: SPACING.xs,
  },
  dateLabel: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.semibold,
    flex: 1,
    textAlign: 'center',
  },

  // ── Session toast
  sessionToast: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(6,6,20,0.5)',
    maxWidth: 260,
  },
  sessionToastBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.3)',
  },
  sessionToastText: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    flexShrink: 1,
  },

  // ── Panel
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(6,6,14,0.6)',
  },
  scrim: {
    position: 'absolute',
    bottom: '100%',
    left: 0, right: 0,
    height: 80,
  },
  panelTopBorder: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  panelInner: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },

  // State rows
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  stateText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.sm,
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  statDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Time endpoints
  timeEndRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -SPACING.xs,
  },
  timeEnd: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },

  // Scrubber
  scrubberWrap: {
    height: 28,
    justifyContent: 'center',
  },
  scrubberTrack: {
    position: 'absolute',
    left: 0, right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  scrubberFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  scrubberGlow: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    opacity: 0.35,
    transform: [{ scaleY: 3 }],
  },
  scrubberThumb: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: -7,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: COLORS.accent,
    ...SHADOWS.accent,
  },

  // Controls
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  ctrlBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    ...SHADOWS.primary,
  },
  playBtnGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedRow: {
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.xs,
    justifyContent: 'flex-end',
  },
  speedBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    minWidth: 38,
    alignItems: 'center',
  },
  speedBtnActive: {
    backgroundColor: 'rgba(0,212,255,0.18)',
    borderColor: COLORS.accent,
  },
  speedLabel: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
  },
  speedLabelActive: {
    color: COLORS.accent,
  },

  // ── Free preview overlay
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    top: 80,
    bottom: 160,
  },
  previewCard: {
    width: '100%',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,20,0.6)',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  previewCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  previewTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.black,
    textAlign: 'center',
  },
  previewSub: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  previewUpgradeBtn: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.xs,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  previewUpgradeBtnGrad: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  previewUpgradeBtnText: {
    color: '#1a1a00',
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.black,
    letterSpacing: 0.4,
  },

  // ── REC badge (top-bar, while recording)
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(220,38,38,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.5)',
    minWidth: 40,
    justifyContent: 'center',
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recLabel: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: FONT.weights.black,
    letterSpacing: 1,
  },

  // ── "Stop recording" completion banner
  recDoneBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(6,6,14,0.5)',
    zIndex: 20,
  },
  recDoneBannerBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(74,222,128,0.3)',
  },
  recDoneBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingTop: 52, // clear status bar
  },
  recDoneBannerText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
  },

  // ── Guided recording setup modal
  recModal: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    zIndex: 30,
  },
  recModalCard: {
    width: '100%',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,8,20,0.7)',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  recModalBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.2)',
  },
  recModalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,212,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  recModalTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.black,
    textAlign: 'center',
  },
  recModalSub: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  recStepList: {
    width: '100%',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  recStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  recStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,212,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  recStepNumText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: FONT.weights.black,
  },
  recStepText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.xs,
    lineHeight: 18,
  },
  recStartBtn: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.xs,
    ...SHADOWS.primary,
  },
  recStartBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  recStartBtnText: {
    color: '#fff',
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.bold,
    letterSpacing: 0.3,
  },
  recCancelText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.sm,
  },
});
