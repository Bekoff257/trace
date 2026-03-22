import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@services/supabaseClient';
import { useAuthStore } from '@stores/authStore';
import GlassInput from '@components/ui/GlassInput';
import GlowButton from '@components/ui/GlowButton';
import SectionLabel from '@components/ui/SectionLabel';
import { COLORS, GRADIENTS, SPACING, FONT, RADIUS } from '@constants/theme';

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export default function UsernameScreen() {
  const { t } = useTranslation();
  const { user, setUsername } = useAuthStore();

  const [value, setValue] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'available' | 'taken' | 'invalid' | 'short'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) { setStatus('idle'); return; }
    if (trimmed.length < 3) { setStatus('short'); return; }
    if (!USERNAME_REGEX.test(trimmed)) { setStatus('invalid'); return; }

    setIsChecking(true);
    setStatus('idle');
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('username', trimmed)
        .maybeSingle();
      setIsChecking(false);
      setStatus(data ? 'taken' : 'available');
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  async function handleCreate() {
    if (!user?.id || status !== 'available') return;
    const trimmed = value.trim().toLowerCase();
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: user.id,
          username: trimmed,
          display_name: user.displayName,
        });
      if (error) throw error;
      setUsername(trimmed);
      router.replace('/(tabs)');
    } catch {
      setStatus('taken');
    } finally {
      setIsSaving(false);
    }
  }

  function handleSkip() {
    router.replace('/(tabs)');
  }

  const statusColor =
    status === 'available' ? COLORS.success :
    status === 'taken' || status === 'invalid' || status === 'short' ? COLORS.error :
    'transparent';

  const statusText =
    status === 'available' ? t('username.available') :
    status === 'taken' ? t('username.taken') :
    status === 'invalid' ? t('username.invalid') :
    status === 'short' ? t('username.tooShort') :
    '';

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.iconGrad}>
              <Ionicons name="at" size={32} color={COLORS.textPrimary} />
            </LinearGradient>
          </View>

          <SectionLabel text={t('username.sectionLabel')} color={COLORS.primary} />
          <Text style={styles.title}>{t('username.title')}</Text>
          <Text style={styles.subtitle}>{t('username.subtitle')}</Text>

          <View style={styles.inputRow}>
            <GlassInput
              label=""
              placeholder={t('username.placeholder')}
              value={value}
              onChangeText={(v) => setValue(v.toLowerCase().replace(/\s/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            {isChecking && (
              <ActivityIndicator
                size="small"
                color={COLORS.primary}
                style={styles.spinner}
              />
            )}
          </View>

          {statusText ? (
            <View style={styles.statusRow}>
              <Ionicons
                name={status === 'available' ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={statusColor}
              />
              <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
            </View>
          ) : null}

          <GlowButton
            label={isSaving ? t('common.loading') : t('username.create')}
            onPress={handleCreate}
            isLoading={isSaving}
            style={styles.createBtn}
          />

          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
            <Text style={styles.skipText}>{t('username.skip')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    paddingBottom: SPACING.xxl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  iconGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.xxl,
    fontWeight: FONT.weights.black,
    marginTop: 4,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.md,
    marginBottom: SPACING.xl,
  },
  inputRow: { position: 'relative' },
  spinner: { position: 'absolute', right: SPACING.md, top: 14 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
    paddingHorizontal: 2,
  },
  statusText: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.medium },
  createBtn: { marginTop: SPACING.md, marginBottom: SPACING.sm },
  skipBtn: { alignSelf: 'center', padding: SPACING.sm },
  skipText: { color: COLORS.textMuted, fontSize: FONT.sizes.sm },
});
