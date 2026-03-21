import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, RADIUS, SPACING, SHADOWS } from '@constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  noPadding?: boolean;
  glow?: 'primary' | 'accent' | 'success' | 'none';
}

export default function GlassCard({
  children,
  style,
  intensity = 60,
  noPadding,
  glow = 'none',
}: GlassCardProps) {
  const glowStyle =
    glow === 'primary'
      ? styles.glowPrimary
      : glow === 'accent'
      ? styles.glowAccent
      : glow === 'success'
      ? styles.glowSuccess
      : null;

  return (
    <View style={[styles.container, glowStyle, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[styles.border, StyleSheet.absoluteFill]} />
      <View style={[styles.content, noPadding && styles.noPadding]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glassMedium,
    ...SHADOWS.card,
  },
  border: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  content: {
    padding: SPACING.md,
  },
  noPadding: {
    padding: 0,
  },
  glowPrimary: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  glowAccent: {
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  glowSuccess: {
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
});
