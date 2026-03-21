import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, RADIUS, FONT, SPACING } from '@constants/theme';

interface ProgressBarProps {
  progress: number; // 0–1
  label?: string;
  style?: ViewStyle;
  height?: number;
  colors?: readonly [string, string, ...string[]];
}

export default function ProgressBar({
  progress,
  label,
  style,
  height = 6,
  colors = GRADIENTS.primary,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <View style={[styles.wrapper, style]}>
      <View style={[styles.track, { height }]}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${clamped * 100}%`, height }]}
        />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  track: {
    backgroundColor: COLORS.glassStrong,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: RADIUS.full,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    marginTop: SPACING.xs,
    textAlign: 'right',
  },
});
