/**
 * Daily Replay — animates the user's GPS path for a selected day,
 * step-by-step on a MapLibre map with play/pause/speed/3D controls.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Map as MapView,
  Camera,
  Layer,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRouteReplay, type PlaybackSpeed } from '@hooks/useRouteReplay';
import RouteLayer from '@components/map/RouteLayer';
import VisitMarker from '@components/map/VisitMarker';
import { MAP_STYLE } from '@constants/mapStyle';
import { COLORS, FONT, SPACING, RADIUS, SHADOWS } from '@constants/theme';

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
  const d = new Date(dateStr + 'T12:00:00');
  const today = localDateString(0);
  const yesterday = localDateString(-1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '——';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}


const SPEEDS: PlaybackSpeed[] = [1, 2, 4, 8];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReplayScreen() {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const [dateOffset, setDateOffset] = useState(0);
  const [is3D, setIs3D] = useState(false);

  // Scrubber track width measured via onLayout
  const trackWidthRef = useRef(0);
  // Keep refs stable for use inside touch responder callbacks
  const totalPointsRef = useRef(0);
  const seekToRef = useRef<(i: number) => void>(() => {});
  const isPlayingRef = useRef(false);
  const pauseRef = useRef<() => void>(() => {});

  const date = localDateString(dateOffset);

  const {
    allCoords,
    visibleCoords,
    sessions,
    isLoading,
    isPlaying,
    progress,
    currentIndex,
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
  } = useRouteReplay(date);

  // Sync refs
  totalPointsRef.current = totalPoints;
  seekToRef.current = seekTo;
  isPlayingRef.current = isPlaying;
  pauseRef.current = pause;

  // ─── Camera state ──────────────────────────────────────────────────────────

  const [cameraCenter, setCameraCenter] = useState<[number, number] | null>(null);
  const [cameraZoom, setCameraZoom] = useState(13);

  // Reset camera when date changes
  useEffect(() => {
    setCameraCenter(null);
    setCameraZoom(13);
  }, [date]);

  // Initial fit: center of bounding box, zoom to show full route
  const initialCenter = useMemo<[number, number]>(() => {
    if (allCoords.length === 0) return [0, 0];
    const lats = allCoords.map((c) => c.latitude);
    const lngs = allCoords.map((c) => c.longitude);
    return [
      (Math.max(...lngs) + Math.min(...lngs)) / 2,
      (Math.max(...lats) + Math.min(...lats)) / 2,
    ];
  }, [allCoords.length]);

  // Zoom level that fits the route (rough estimate from span)
  const initialZoom = useMemo(() => {
    if (allCoords.length < 2) return 13;
    const lats = allCoords.map((c) => c.latitude);
    const lngs = allCoords.map((c) => c.longitude);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    const span = Math.max(latSpan, lngSpan);
    if (span > 0.1) return 11;
    if (span > 0.02) return 13;
    return 15;
  }, [allCoords.length]);

  // Set initial camera when route loads
  useEffect(() => {
    if (allCoords.length === 0) return;
    setCameraCenter(initialCenter);
    setCameraZoom(initialZoom);
  }, [allCoords.length]);

  // Follow head during playback
  useEffect(() => {
    const n = visibleCoords.length;
    if (n === 0) return;
    const head = visibleCoords[n - 1];
    setCameraCenter([head.longitude, head.latitude]);
    setCameraZoom(16);
  }, [currentIndex]);

  // ─── Visible sessions (pop up as playback reaches them) ────────────────────

  const visibleSessions = useMemo(
    () => sessions.filter((s) => !currentTime || s.startedAt <= currentTime),
    [sessions, currentTime],
  );

  // ─── Scrubber touch responder ──────────────────────────────────────────────

  const handleScrubberTouch = useCallback((locationX: number) => {
    const w = trackWidthRef.current;
    if (w === 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / w));
    seekToRef.current(Math.round(ratio * totalPointsRef.current));
  }, []);

  const scrubberProps = {
    onLayout: (e: any) => { trackWidthRef.current = e.nativeEvent.layout.width; },
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: any) => {
      if (isPlayingRef.current) pauseRef.current();
      handleScrubberTouch(e.nativeEvent.locationX);
    },
    onResponderMove: (e: any) => handleScrubberTouch(e.nativeEvent.locationX),
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const hasData = !isLoading && totalPoints > 0;
  const noData = !isLoading && totalPoints === 0;
  const thumbLeft = trackWidthRef.current > 0
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
          center={cameraCenter ?? [0, 0]}
          zoom={cameraZoom}
          pitch={is3D ? 45 : 0}
        />

        {hasData && (
          <RouteLayer allCoords={allCoords} visibleCoords={visibleCoords} />
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
        </View>
      </SafeAreaView>

      {/* ── Controls panel ── */}
      <View style={[styles.panel, { paddingBottom: safeBottom + SPACING.md }]}>
        {/* Gradient scrim above panel */}
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
              {/* Time row */}
              <View style={styles.timeRow}>
                <Text style={styles.currentTimeText}>
                  {formatTime(currentTime ?? startTime)}
                </Text>
                <Text style={styles.timeSep}>·</Text>
                <Text style={styles.totalPointsText}>{totalPoints.toLocaleString()} pts</Text>
                <Text style={styles.timeSep}>·</Text>
                <Text style={styles.endTimeText}>{formatTime(endTime)}</Text>
              </View>

              {/* Scrubber */}
              <View style={styles.scrubberWrap} {...scrubberProps}>
                {/* Background track */}
                <View style={styles.scrubberTrack} />
                {/* Filled portion */}
                <View
                  style={[
                    styles.scrubberFill,
                    { width: `${Math.min(100, progress * 100)}%` as any },
                  ]}
                />
                {/* Glow on fill */}
                <View
                  style={[
                    styles.scrubberGlow,
                    { width: `${Math.min(100, progress * 100)}%` as any },
                  ]}
                />
                {/* Thumb */}
                <View style={[styles.scrubberThumb, { left: thumbLeft }]} />
              </View>

              {/* Buttons row */}
              <View style={styles.controlRow}>
                {/* Restart */}
                <TouchableOpacity
                  style={styles.ctrlBtn}
                  onPress={restart}
                  activeOpacity={0.7}
                >
                  <Ionicons name="play-skip-back" size={19} color={COLORS.textSecondary} />
                </TouchableOpacity>

                {/* Play / Pause */}
                <TouchableOpacity
                  style={styles.playBtn}
                  onPress={isPlaying ? pause : play}
                  activeOpacity={0.85}
                >
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

                {/* Speed selector */}
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
    top: 0,
    left: 0,
    right: 0,
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

  // Date pill
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

  // ── Panel
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(6,6,14,0.6)',
  },
  scrim: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    height: 80,
  },
  panelTopBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  panelInner: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.md,
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

  // Time row
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  currentTimeText: {
    color: COLORS.accent,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  timeSep: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
  },
  totalPointsText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    flex: 1,
    textAlign: 'center',
  },
  endTimeText: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.sm,
    fontVariant: ['tabular-nums'],
  },

  // Scrubber
  scrubberWrap: {
    height: 28,
    justifyContent: 'center',
  },
  scrubberTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
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
    minWidth: 36,
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
});
