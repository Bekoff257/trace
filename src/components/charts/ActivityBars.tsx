/**
 * ActivityBars — 7-day activity bar chart built with pure React Native Views.
 * No third-party charting library needed.
 *
 * Props:
 *   data  — array of { label: string; value: number } (value in any unit, e.g. meters)
 *   color — bar fill color (defaults to COLORS.primary)
 *   height — chart height in points (defaults to 80)
 */
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT, RADIUS } from '@constants/theme';

export interface ActivityBar {
  label: string;   // e.g. 'M', 'T', 'W' …
  value: number;   // raw metric (e.g. distance in meters)
  isToday?: boolean;
}

interface ActivityBarsProps {
  data: ActivityBar[];
  color?: string;
  height?: number;
}

export default function ActivityBars({ data, color = COLORS.primary, height = 80 }: ActivityBarsProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.container}>
      {data.map((bar, i) => {
        const fillPct = bar.value / max;
        const barH = Math.max(fillPct * height, bar.value > 0 ? 4 : 0);
        const isActive = bar.isToday;

        return (
          <View key={i} style={[styles.col, { height: height + 20 }]}>
            {/* Bar track */}
            <View style={[styles.track, { height }]}>
              {/* Fill */}
              {bar.value > 0 && (
                <View style={[styles.fill, { height: barH, bottom: 0 }]}>
                  <LinearGradient
                    colors={isActive ? [color, `${color}88`] : [`${color}BB`, `${color}44`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              )}
            </View>
            {/* Day label */}
            <Text style={[styles.label, isActive && { color: color }]}>
              {bar.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 2,
  },
  track: {
    width: '100%',
    justifyContent: 'flex-end',
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: RADIUS.xs,
    overflow: 'hidden',
  },
  label: {
    marginTop: 6,
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.medium,
    textAlign: 'center',
  },
});
