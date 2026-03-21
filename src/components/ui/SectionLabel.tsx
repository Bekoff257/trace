import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, FONT, SPACING, RADIUS } from '@constants/theme';

interface SectionLabelProps {
  text: string;
  color?: string;
  style?: ViewStyle;
}

export default function SectionLabel({ text, color = COLORS.accent, style }: SectionLabelProps) {
  return (
    <View style={[styles.pill, { borderColor: `${color}40`, backgroundColor: `${color}15` }, style]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    marginBottom: SPACING.xs,
  },
  text: {
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 0.8,
  },
});
