import { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SHADOWS } from '@constants/theme';

const { width } = Dimensions.get('window');

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  buttons?: AlertButton[];
  onDismiss: () => void;
}

export function CustomAlert({
  visible,
  title,
  message,
  icon,
  iconColor = COLORS.primary,
  buttons = [{ text: 'OK' }],
  onDismiss,
}: CustomAlertProps) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      const anim = Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          tension: 120,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]);
      anim.start();
      return () => anim.stop();
    } else {
      scale.stopAnimation();
      opacity.stopAnimation();
      scale.setValue(0.85);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ scale }], opacity }]}>
          {/* Glass background */}
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.03)']}
            style={StyleSheet.absoluteFill}
          />
          {/* Border */}
          <View style={styles.border} />

          {/* Icon */}
          {icon && (
            <View style={[styles.iconWrap, { backgroundColor: iconColor + '22' }]}>
              <Ionicons name={icon} size={26} color={iconColor} />
            </View>
          )}

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Message */}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Buttons */}
          <View style={[styles.btnRow, buttons.length > 2 && styles.btnCol]}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const isPrimary = !isDestructive && !isCancel;

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.btn,
                    buttons.length === 1 && styles.btnFull,
                    buttons.length > 2 && styles.btnFullRow,
                    i > 0 && buttons.length === 2 && styles.btnRight,
                  ]}
                  onPress={() => {
                    btn.onPress?.();
                    onDismiss();
                  }}
                  activeOpacity={0.7}
                >
                  {isPrimary && (
                    <LinearGradient
                      colors={['#5B7FFF', '#8B5CF6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text
                    style={[
                      styles.btnText,
                      isDestructive && styles.btnTextDestructive,
                      isCancel && styles.btnTextCancel,
                      isPrimary && styles.btnTextPrimary,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Hook for imperative usage ─────────────────────────────────────────────────

import { useState, useCallback } from 'react';

interface AlertOptions {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  buttons?: AlertButton[];
}

export function useAlert() {
  const [state, setState] = useState<AlertOptions & { visible: boolean }>({
    visible: false,
    title: '',
  });

  const show = useCallback((opts: AlertOptions) => {
    setState({ ...opts, visible: true });
  }, []);

  const hide = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const element = (
    <CustomAlert
      visible={state.visible}
      title={state.title}
      message={state.message}
      icon={state.icon}
      iconColor={state.iconColor}
      buttons={state.buttons}
      onDismiss={hide}
    />
  );

  return { show, hide, element };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: width * 0.82,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    padding: 24,
    paddingBottom: 0,
    backgroundColor: 'rgba(12,12,24,0.96)',
    ...SHADOWS.strong,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  iconWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: FONT.semiBold,
    fontSize: 17,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 20,
    marginHorizontal: -24,
  },
  btnRow: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  btnCol: {
    flexDirection: 'column',
    gap: 6,
    paddingBottom: 16,
  },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnFull: {
    flex: 1,
  },
  btnFullRow: {
    flex: undefined,
    width: '100%',
  },
  btnRight: {
    marginLeft: 8,
  },
  btnText: {
    fontFamily: FONT.medium,
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  btnTextPrimary: {
    color: '#fff',
    fontFamily: FONT.semiBold,
  },
  btnTextDestructive: {
    color: COLORS.error ?? '#FF4444',
  },
  btnTextCancel: {
    color: COLORS.textSecondary,
  },
});
