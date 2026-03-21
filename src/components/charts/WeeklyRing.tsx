/**
 * WeeklyRing — circular progress ring showing a 0–100 weekly activity score.
 * Built with SVG via react-native-svg (included in Expo SDK).
 *
 * Props:
 *   score  — 0 to 100
 *   size   — diameter in points (default 120)
 *   stroke — ring color (default COLORS.primary)
 */
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, FONT } from '@constants/theme';

interface WeeklyRingProps {
  score: number;
  size?: number;
  stroke?: string;
  label?: string;
}

export default function WeeklyRing({
  score,
  size = 120,
  stroke = COLORS.primary,
  label,
}: WeeklyRingProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (clampedScore / 100) * circumference;
  const cx = size / 2;

  // Score label color
  const scoreColor =
    clampedScore >= 75 ? COLORS.success
    : clampedScore >= 40 ? COLORS.warning
    : COLORS.error;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={cx}
          cy={cx}
          r={radius}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Fill — rotated so it starts at the top */}
        <Circle
          cx={cx}
          cy={cx}
          r={radius}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${cx}, ${cx}`}
          opacity={0.9}
        />
      </Svg>
      {/* Center text */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.center}>
          <Text style={[styles.score, { color: scoreColor, fontSize: size * 0.28 }]}>
            {clampedScore}
          </Text>
          {label ? (
            <Text style={[styles.label, { fontSize: size * 0.1 }]}>{label}</Text>
          ) : (
            <Text style={[styles.label, { fontSize: size * 0.1 }]}>/ 100</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontWeight: FONT.weights.black,
    lineHeight: undefined,
  },
  label: {
    color: COLORS.textMuted,
    fontWeight: FONT.weights.medium,
    marginTop: 2,
  },
});
