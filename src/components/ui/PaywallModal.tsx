import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { usePlanStore } from '@stores/planStore';
import { COLORS, FONT, SPACING, RADIUS } from '@constants/theme';

const FEATURES: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; sub: string }> = [
  { icon: 'play-circle-outline', label: '3D Replay Mode',          sub: 'Relive your day step by step'           },
  { icon: 'footsteps-outline',   label: 'Full Footsteps Trail',    sub: 'See every step you took'                },
  { icon: 'calendar-outline',    label: 'Complete History Access', sub: 'Browse all your past days'              },
  { icon: 'analytics-outline',   label: 'Life Insights',           sub: 'Deeper stats, habits & patterns'       },
];

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PaywallModal({ visible, onClose }: PaywallModalProps) {
  const { setUserPlan } = usePlanStore();

  function handleUpgrade() {
    setUserPlan('premium');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.border} />

              {/* Handle bar */}
              <View style={styles.handle} />

              {/* Icon */}
              <View style={styles.iconWrap}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.iconGrad}>
                  <Ionicons name="star" size={28} color="#fff" />
                </LinearGradient>
              </View>

              {/* Copy */}
              <Text style={styles.title}>Understand Your Life 👑</Text>
              <Text style={styles.subtitle}>
                Replay your days, explore your habits, and unlock your full history.
              </Text>

              {/* Features */}
              <View style={styles.featureList}>
                {FEATURES.map((f) => (
                  <View key={f.label} style={styles.featureRow}>
                    <View style={styles.featureIcon}>
                      <Ionicons name={f.icon} size={18} color={COLORS.accent} />
                    </View>
                    <View style={styles.featureText}>
                      <Text style={styles.featureLabel}>{f.label}</Text>
                      <Text style={styles.featureSub}>{f.sub}</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                  </View>
                ))}
              </View>

              {/* Upgrade button */}
              <TouchableOpacity style={styles.upgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.upgradeBtnGrad}>
                  <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.laterBtn}>
                <Text style={styles.laterText}>Maybe Later</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,24,0.97)',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
    alignItems: 'center',
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: SPACING.lg,
  },

  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  iconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  title: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xl + 2,
    fontWeight: FONT.weights.black,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },

  featureList: {
    width: '100%',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: `${COLORS.accent}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureLabel: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.semibold,
  },
  featureSub: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    marginTop: 1,
  },

  upgradeBtn: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  upgradeBtnGrad: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: {
    color: '#1a1a00',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.black,
    letterSpacing: 0.5,
  },

  laterBtn: { paddingVertical: SPACING.sm },
  laterText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.medium,
  },
});
