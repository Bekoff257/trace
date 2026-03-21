import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';

const { width, height } = Dimensions.get('window');

// Decorative dot positions — fixed to avoid re-renders
const DOTS = [
  { x: 0.08, y: 0.12, size: 3, opacity: 0.5 },
  { x: 0.85, y: 0.08, size: 2, opacity: 0.4 },
  { x: 0.92, y: 0.22, size: 4, opacity: 0.3 },
  { x: 0.05, y: 0.30, size: 2, opacity: 0.35 },
  { x: 0.78, y: 0.35, size: 3, opacity: 0.4 },
  { x: 0.15, y: 0.55, size: 2, opacity: 0.3 },
  { x: 0.88, y: 0.58, size: 3, opacity: 0.45 },
  { x: 0.25, y: 0.72, size: 2, opacity: 0.35 },
  { x: 0.70, y: 0.68, size: 4, opacity: 0.3 },
  { x: 0.50, y: 0.15, size: 2, opacity: 0.4 },
  { x: 0.40, y: 0.78, size: 3, opacity: 0.3 },
  { x: 0.95, y: 0.78, size: 2, opacity: 0.35 },
];

export default function OnboardingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const cardSlide = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    const anim1 = Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]);
    const anim2 = Animated.timing(cardSlide, {
      toValue: 0,
      duration: 600,
      delay: 300,
      useNativeDriver: true,
    });
    anim1.start();
    anim2.start();
    return () => { anim1.stop(); anim2.stop(); };
  }, []);

  const handleEnableLocation = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      await Location.requestBackgroundPermissionsAsync();
    }
    router.replace('/(auth)/login');
  };

  const handleSkip = () => {
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Glow orbs */}
      <View style={styles.glowOrb1} pointerEvents="none">
        <LinearGradient colors={[COLORS.primaryGlow, 'transparent']} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.glowOrb2} pointerEvents="none">
        <LinearGradient colors={[COLORS.accentGlow, 'transparent']} style={StyleSheet.absoluteFill} />
      </View>

      {/* Decorative dots */}
      {DOTS.map((dot, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.dot,
            {
              left: dot.x * width,
              top: dot.y * height,
              width: dot.size,
              height: dot.size,
              opacity: dot.opacity,
            },
          ]}
        />
      ))}

      <SafeAreaView style={styles.safe}>
        {/* Skip button */}
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>SKIP</Text>
        </TouchableOpacity>

        {/* Center content */}
        <Animated.View
          style={[
            styles.centerContent,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Glowing location icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconGlow} />
            <View style={styles.iconRing}>
              <LinearGradient colors={GRADIENTS.primary} style={styles.iconGradient}>
                <Ionicons name="location" size={28} color={COLORS.textPrimary} />
              </LinearGradient>
            </View>
          </View>

          <SectionLabel text="LOCATION DATA" color={COLORS.accent} style={styles.pill} />

          <Text style={styles.headline}>
            Your life,{'\n'}
            <Text style={styles.headlineAccent}>visualized.</Text>
          </Text>

          <Text style={styles.subtitle}>
            Watch your daily paths turn into{'\n'}
            stunning, glowing stories over time.
          </Text>
        </Animated.View>

        {/* Bottom card */}
        <Animated.View
          style={[styles.bottomSection, { transform: [{ translateY: cardSlide }], opacity: fadeAnim }]}
        >
          {/* Privacy card */}
          <View style={styles.privacyCard}>
            <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.privacyBorder} />
            <View style={styles.privacyContent}>
              <View style={styles.privacyIconWrap}>
                <LinearGradient colors={GRADIENTS.primary} style={styles.privacyIconGrad}>
                  <Ionicons name="navigate" size={18} color={COLORS.textPrimary} />
                </LinearGradient>
              </View>
              <View style={styles.privacyText}>
                <Text style={styles.privacyTitle}>Always Allow</Text>
                <Text style={styles.privacyDesc}>
                  We track locally. Your data{' '}
                  <Text style={styles.privacyNever}>never</Text> leaves your device.
                </Text>
              </View>
            </View>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            style={styles.ctaWrapper}
            onPress={handleEnableLocation}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={GRADIENTS.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              <Text style={styles.ctaText}>Enable Location</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.textPrimary} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1, paddingHorizontal: SPACING.lg },
  glowOrb1: {
    position: 'absolute',
    top: height * 0.1,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    overflow: 'hidden',
    opacity: 0.7,
  },
  glowOrb2: {
    position: 'absolute',
    top: height * 0.25,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
    opacity: 0.5,
  },
  dot: {
    position: 'absolute',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.textSecondary,
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.lg,
    marginTop: SPACING.xs,
  },
  skipText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: SPACING.xxl,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  iconGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primaryGlow,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${COLORS.primary}60`,
  },
  iconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    marginBottom: SPACING.md,
  },
  headline: {
    color: COLORS.textPrimary,
    fontSize: 42,
    fontWeight: FONT.weights.black,
    textAlign: 'center',
    lineHeight: 48,
    marginBottom: SPACING.md,
  },
  headlineAccent: {
    color: COLORS.textPrimary,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomSection: {
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  privacyCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
  },
  privacyBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  privacyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  privacyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  privacyIconGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyText: { flex: 1 },
  privacyTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
    marginBottom: 2,
  },
  privacyDesc: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.sm,
    lineHeight: 18,
  },
  privacyNever: {
    color: COLORS.textPrimary,
    fontWeight: FONT.weights.semibold,
    fontStyle: 'italic',
  },
  ctaWrapper: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  ctaBtn: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  ctaText: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.semibold,
  },
});
