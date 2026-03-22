import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import GlassInput from '@components/ui/GlassInput';
import GlowButton from '@components/ui/GlowButton';
import { COLORS, GRADIENTS, SPACING, FONT, RADIUS } from '@constants/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const { signInWithEmail, signInWithGoogle, isLoading, error, clearError } = useAuthStore();

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (!email.trim()) errors.email = t('login.emailRequired');
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = t('login.emailInvalid');
    if (!password) errors.password = t('login.passwordRequired');
    else if (password.length < 6) errors.password = t('login.passwordMin');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    clearError();
    if (!validate()) return;
    await signInWithEmail(email.trim(), password);
  };

  const handleGoogle = async () => {
    clearError();
    await signInWithGoogle();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header glow orb */}
          <View style={styles.glowOrb} pointerEvents="none">
            <LinearGradient
              colors={[COLORS.primaryGlow, 'transparent']}
              style={StyleSheet.absoluteFill}
            />
          </View>

          {/* Logo / Brand */}
          <View style={styles.header}>
            <View style={styles.logoMark}>
              <LinearGradient colors={GRADIENTS.primary} style={styles.logoGradient}>
                <Text style={styles.logoText}>L</Text>
              </LinearGradient>
            </View>
            <Text style={styles.title}>{t('login.title')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
          </View>

          {/* Form card */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            <GlassInput
              label={t('login.email')}
              placeholder="you@example.com"
              value={email}
              onChangeText={(v) => { setEmail(v); clearError(); }}
              keyboardType="email-address"
              error={fieldErrors.email}
              returnKeyType="next"
            />

            <GlassInput
              label={t('login.password')}
              placeholder="••••••••"
              value={password}
              onChangeText={(v) => { setPassword(v); clearError(); }}
              isPassword
              error={fieldErrors.password}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity style={styles.forgotRow}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <GlowButton
              label={t('login.signIn')}
              onPress={handleLogin}
              isLoading={isLoading}
              style={styles.signInBtn}
            />

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <GlowButton
              label={t('login.continueGoogle')}
              onPress={handleGoogle}
              variant="google"
              isLoading={isLoading}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('login.noAccount')} </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
              <Text style={styles.footerLink}>{t('login.signUp')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  glowOrb: {
    position: 'absolute',
    top: -120,
    alignSelf: 'center',
    width: 320,
    height: 320,
    borderRadius: 160,
    overflow: 'hidden',
    opacity: 0.6,
  },
  header: {
    alignItems: 'center',
    marginTop: SPACING.xxl,
    marginBottom: SPACING.xl,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  logoGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: COLORS.textPrimary,
    fontSize: 30,
    fontWeight: FONT.weights.black,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xxl,
    fontWeight: FONT.weights.bold,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.regular,
  },
  form: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(247,95,95,0.15)',
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorBannerText: {
    color: COLORS.error,
    fontSize: FONT.sizes.sm,
    textAlign: 'center',
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.lg,
    marginTop: -SPACING.xs,
  },
  forgotText: {
    color: COLORS.primary,
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.medium,
  },
  signInBtn: {
    marginBottom: SPACING.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.medium,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.md,
  },
  footerLink: {
    color: COLORS.primary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
  },
});
