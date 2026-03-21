import { useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Text,
  Platform,
  Dimensions,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS } from '@constants/theme';

const R = 32;
const { width: SCREEN_W } = Dimensions.get('window');
// Map tab is index 2 of 5. wrapper has paddingHorizontal: 14.
const TAB_W = (SCREEN_W - 28) / 5;
const DISC_SIZE = 52;
const DISC_LEFT = 14 + TAB_W * 2.5 - DISC_SIZE / 2;

type TabName = 'index' | 'timeline' | 'map' | 'history' | 'profile';

const TAB_META: Record<TabName, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}> = {
  index:    { label: 'Home',     icon: 'home-outline',     iconActive: 'home' },
  timeline: { label: 'Timeline', icon: 'time-outline',     iconActive: 'time' },
  map:      { label: 'Map',      icon: 'map-outline',      iconActive: 'map' },
  history:  { label: 'History',  icon: 'calendar-outline', iconActive: 'calendar' },
  profile:  { label: 'Me',       icon: 'person-outline',   iconActive: 'person' },
};

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const isMapFocused = state.routes[state.index]?.name === 'map';

  // Floating disc lives OUTSIDE the clipped bar so it can rise above it
  const discFloat = useRef(new Animated.Value(0)).current;
  const discOpacity = useRef(new Animated.Value(isMapFocused ? 1 : 0)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.spring(discFloat, {
        toValue: isMapFocused ? -10 : 0,
        useNativeDriver: true,
        tension: 140,
        friction: 10,
      }),
      Animated.timing(discOpacity, {
        toValue: isMapFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [isMapFocused]);

  const pb = Math.max(insets.bottom, 10);
  // Disc center sits on the bar's top edge → bottom half inside bar, top half above
  const discBottom = pb + 26;

  return (
    <View style={[styles.wrapper, { paddingBottom: pb }]}>
      {/* ── Floating map disc ─────────────────────────────────────────────────
          Rendered here (outside clip/overflow:hidden) so it can rise above  */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.floatDisc,
          {
            bottom: discBottom,
            left: DISC_LEFT,
            transform: [{ translateY: discFloat }],
            opacity: discOpacity,
          },
        ]}
      >
        <LinearGradient
          colors={GRADIENTS.primary}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <Ionicons name="map" size={24} color="#fff" />
      </Animated.View>

      {/* ── Tab bar body ──────────────────────────────────────────────────── */}
      <View style={styles.shadow}>
        <View style={styles.clip}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null}
          <View style={styles.bg} />
          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <View style={styles.border} />

          <View style={styles.tabs}>
            {state.routes.map((route, index) => {
              const meta = TAB_META[route.name as TabName];
              if (!meta) return null;
              const isFocused = state.index === index;
              return (
                <TabItem
                  key={route.key}
                  name={route.name as TabName}
                  meta={meta}
                  isFocused={isFocused}
                  onPress={() => {
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(route.name);
                    }
                  }}
                />
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

function TabItem({
  name,
  meta,
  isFocused,
  onPress,
}: {
  name: TabName;
  meta: { label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap };
  isFocused: boolean;
  onPress: () => void;
}) {
  const isMap = name === 'map';

  // Non-map animations only
  const scale = useRef(new Animated.Value(!isMap && isFocused ? 1 : 0.92)).current;
  const pillOpacity = useRef(new Animated.Value(!isMap && isFocused ? 1 : 0)).current;

  useEffect(() => {
    if (isMap) return;
    const anim = Animated.parallel([
      Animated.spring(scale, {
        toValue: isFocused ? 1 : 0.92,
        useNativeDriver: true,
        tension: 130,
        friction: 9,
      }),
      Animated.timing(pillOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [isFocused]);

  // Map tab: just a touch target — floating disc above is the visual when active
  if (isMap) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.tabBtn}>
        {!isFocused && (
          <>
            <Ionicons name="map-outline" size={21} color={COLORS.textMuted} />
            <Text style={[styles.label, { color: COLORS.textMuted }]}>{meta.label}</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.tabBtn}>
      <Animated.View style={[styles.tabInner, { transform: [{ scale }] }]}>
        {/* Active gradient pill */}
        <Animated.View style={[styles.activePill, { opacity: pillOpacity }]}>
          <LinearGradient
            colors={GRADIENTS.primary}
            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
        <Ionicons
          name={isFocused ? meta.iconActive : meta.icon}
          size={21}
          color={isFocused ? '#fff' : COLORS.textMuted}
        />
        <Text style={[styles.label, { color: isFocused ? '#fff' : COLORS.textMuted }]}>
          {meta.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
  },
  shadow: {
    borderRadius: R,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 18,
  },
  clip: {
    borderRadius: R,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? 'rgba(14,14,24,0.97)' : 'transparent',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(10,10,20,0.55)' : 'transparent',
  },
  border: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: R,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  tabs: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 24,
    minWidth: 52,
    gap: 3,
  },
  activePill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 24,
    overflow: 'hidden',
  },
  // Floating disc — lives in wrapper, outside overflow:hidden clip
  floatDisc: {
    position: 'absolute',
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#5B7FFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.75,
    shadowRadius: 16,
    elevation: 20,
  },
  label: {
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
