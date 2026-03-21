import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, FONT } from '@constants/theme';

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  value: string;
  sub?: string;
  style?: ViewStyle;
}

export default function StatCard({ icon, iconColor = COLORS.primary, label, value, sub, style }: StatCardProps) {
  return (
    <View style={[styles.card, style]}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.border} />
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    minHeight: 90,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  content: {
    padding: SPACING.md,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.medium,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.bold,
  },
  sub: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    marginTop: 1,
  },
});
