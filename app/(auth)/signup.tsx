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
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import GlassInput from '@components/ui/GlassInput';
import GlowButton from '@components/ui/GlowButton';
import { COLORS, GRADIENTS, SPACING, FONT, RADIUS } from '@constants/theme';

export default function SignupScreen() {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const { signUpWithEmail, signInWithGoogle, isLoading, error, clearError, pendingEmailConfirmation } = useAuthStore();

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (!displayName.trim()) errors.displayName = t('signup.nameRequired');
    if (!email.trim()) errors.email = t('signup.emailRequired');
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = t('signup.emailInvalid');
    if (!password) errors.password = t('signup.passwordRequired');
    else if (password.length < 6) errors.password = t('signup.passwordMin');
    if (password !== confirmPassword) errors.confirmPassword = t('signup.passwordMismatch');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignup = async () => {
    clearError();
    if (!validate()) return;
    await signUpWithEmail(email.trim(), password, displayName.trim());
  };

  const handleGoogle = async () => {
    clearError();
    await signInWithGoogle();
  };

  // ── Email confirmation pending ─────────────────────────────────────────────
  if (pendingEmailConfirmation) {
    return (
      <SafeAreaView style={styles.safe}>
        <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />
        <View style={styles.confirmWrap}>
          <View style={styles.confirmIconWrap}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.confirmIconGrad}>
              <Ionicons name="mail-outline" size={32} color={COLORS.textPrimary} />
            </LinearGradient>
          </View>
          <Text style={styles.confirmTitle}>{t('signup.checkEmail')}</Text>
          <Text style={styles.confirmBody}>
            {t('signup.confirmSent', { email: email.trim() })}
          </Text>
          <GlowButton
            label={t('signup.backToLogin')}
            onPress={() => {
              clearError();
              router.replace('/(auth)/login');
            }}
            style={styles.confirmBtn}
          />
          <TouchableOpacity onPress={clearError} style={styles.confirmBack}>
            <Text style={styles.confirmBackText}>← Try a different email</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
          {/* Glow orb */}
          <View style={styles.glowOrb} pointerEvents="none">
            <LinearGradient
              colors={[COLORS.accentGlow, 'transparent']}
              style={StyleSheet.absoluteFill}
            />
          </View>

          {/* Back + Header */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.logoMark}>
              <LinearGradient colors={GRADIENTS.accent} style={styles.logoGradient}>
                <Text style={styles.logoText}>L</Text>
              </LinearGradient>
            </View>
            <Text style={styles.title}>{t('signup.title')}</Text>
            <Text style={styles.subtitle}>{t('signup.subtitle')}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            <GlassInput
              label={t('signup.name')}
              placeholder="Alex Johnson"
              value={displayName}
              onChangeText={(v) => { setDisplayName(v); clearError(); }}
              autoCapitalize="words"
              error={fieldErrors.displayName}
              returnKeyType="next"
            />

            <GlassInput
              label={t('signup.email')}
              placeholder="you@example.com"
              value={email}
              onChangeText={(v) => { setEmail(v); clearError(); }}
              keyboardType="email-address"
              error={fieldErrors.email}
              returnKeyType="next"
            />

            <GlassInput
              label={t('signup.password')}
              placeholder="••••••••"
              value={password}
              onChangeText={(v) => { setPassword(v); clearError(); }}
              isPassword
              error={fieldErrors.password}
              returnKeyType="next"
            />

            <GlassInput
              label={t('signup.confirmPassword')}
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError(); }}
              isPassword
              error={fieldErrors.confirmPassword}
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />

            <Text style={styles.terms}>
              By signing up you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>

            <GlowButton
              label={t('signup.createAccount')}
              onPress={handleSignup}
              isLoading={isLoading}
              style={styles.signUpBtn}
            />

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <GlowButton
              label={t('signup.continueGoogle')}
              onPress={handleGoogle}
              variant="google"
              isLoading={isLoading}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('signup.hasAccount')} </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.footerLink}>{t('signup.signIn')}</Text>
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
    top: -100,
    alignSelf: 'center',
    width: 300,
    height: 300,
    borderRadius: 150,
    overflow: 'hidden',
    opacity: 0.5,
  },
  backBtn: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    alignSelf: 'flex-start',
  },
  backText: {
    color: COLORS.primary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.medium,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    shadowColor: COLORS.accent,
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
  },
  form: {},
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
  terms: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    textAlign: 'center',
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.primary,
    fontWeight: FONT.weights.medium,
  },
  signUpBtn: {
    marginBottom: SPACING.md,
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

  // Confirmation screen
  confirmWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  confirmIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  confirmIconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xxl,
    fontWeight: FONT.weights.black,
    marginBottom: SPACING.md,
  },
  confirmBody: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.md,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  confirmEmail: {
    color: COLORS.primary,
    fontWeight: FONT.weights.semibold,
  },
  confirmBtn: { width: '100%', marginBottom: SPACING.md },
  confirmBack: { marginTop: SPACING.xs },
  confirmBackText: { color: COLORS.textMuted, fontSize: FONT.sizes.sm },
});
