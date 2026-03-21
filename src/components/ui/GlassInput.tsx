import { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { COLORS, RADIUS, SPACING, FONT } from '@constants/theme';

interface GlassInputProps extends TextInputProps {
  label?: string;
  error?: string;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  isPassword?: boolean;
}

export default function GlassInput({
  label,
  error,
  rightIcon,
  containerStyle,
  isPassword,
  secureTextEntry,
  ...rest
}: GlassInputProps) {
  const [isSecure, setIsSecure] = useState(isPassword ?? false);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.inputContainer, error ? styles.inputError : null]}>
        <TextInput
          style={styles.input}
          placeholderTextColor={COLORS.textMuted}
          selectionColor={COLORS.primary}
          secureTextEntry={isPassword ? isSecure : secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
        />
        {isPassword ? (
          <TouchableOpacity
            onPress={() => setIsSecure((v) => !v)}
            style={styles.eyeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.eyeText}>{isSecure ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        ) : rightIcon ? (
          <View style={styles.rightIcon}>{rightIcon}</View>
        ) : null}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.medium,
    marginBottom: SPACING.xs,
    letterSpacing: 0.3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.regular,
    paddingVertical: 0,
  },
  eyeButton: {
    paddingLeft: SPACING.sm,
  },
  eyeText: {
    fontSize: 16,
  },
  rightIcon: {
    paddingLeft: SPACING.sm,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT.sizes.xs,
    marginTop: SPACING.xs,
    marginLeft: 2,
  },
});
