import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, GRADIENTS, RADIUS, SPACING, FONT, SHADOWS } from '@constants/theme';

interface GlowButtonProps {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'google';
  style?: ViewStyle;
  labelStyle?: TextStyle;
  leftIcon?: React.ReactNode;
}

export default function GlowButton({
  label,
  onPress,
  isLoading,
  disabled,
  variant = 'primary',
  style,
  labelStyle,
  leftIcon,
}: GlowButtonProps) {
  const handlePress = () => {
    if (disabled || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || isLoading}
        activeOpacity={0.85}
        style={[styles.base, style, (disabled || isLoading) && styles.disabled]}
      >
        <LinearGradient
          colors={GRADIENTS.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.gradient, SHADOWS.primary]}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.textPrimary} size="small" />
          ) : (
            <View style={styles.row}>
              {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
              <Text style={[styles.labelPrimary, labelStyle]}>{label}</Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === 'google') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || isLoading}
        activeOpacity={0.8}
        style={[styles.base, styles.googleButton, style]}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.textPrimary} size="small" />
        ) : (
          <View style={styles.row}>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={[styles.labelGoogle, labelStyle]}>{label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'ghost') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || isLoading}
        activeOpacity={0.7}
        style={[styles.base, style]}
      >
        <Text style={[styles.labelGhost, labelStyle]}>{label}</Text>
      </TouchableOpacity>
    );
  }

  // secondary
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
      style={[styles.base, styles.secondaryButton, style]}
    >
      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} size="small" />
      ) : (
        <View style={styles.row}>
          {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
          <Text style={[styles.labelSecondary, labelStyle]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: COLORS.glass,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  googleButton: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  disabled: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  leftIcon: {
    marginRight: 4,
  },
  labelPrimary: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 0.3,
  },
  labelSecondary: {
    color: COLORS.primary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
  },
  labelGhost: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.medium,
  },
  labelGoogle: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
  },
  googleIcon: {
    color: '#4285F4',
    fontSize: 18,
    fontWeight: FONT.weights.bold,
  },
});
