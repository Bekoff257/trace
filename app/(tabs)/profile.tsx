import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Linking, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, changeLanguage, getCurrentLanguage, type Language } from '@i18n/index';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import { useLocationStore } from '@stores/locationStore';
import { usePlanStore } from '@stores/planStore';
import PaywallScreen from '@components/ui/PaywallScreen';
import { supabase } from '@services/supabaseClient';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import { exportVisitSessionsCSV } from '@services/exportService';
import { startTracking, stopTracking, restartTracking } from '@services/locationService';

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value?: string;
  onPress?: () => void;
  isToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  danger?: boolean;
}

function MenuRow({ icon, iconColor, label, value, onPress, isToggle, toggleValue, onToggle, danger }: MenuRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={styles.menuRow}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      <View style={styles.menuRight}>
        {value ? <Text style={styles.menuValue}>{value}</Text> : null}
        {isToggle ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            trackColor={{ false: COLORS.glass, true: COLORS.primary }}
            thumbColor={COLORS.textPrimary}
          />
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, signOut, updateProfile } = useAuthStore();
  const { isTracking, mode, setTrackingMode, setTracking } = useLocationStore();
  const { userPlan } = usePlanStore();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const displayName = user?.displayName ?? 'Alex';
  const email = user?.email ?? 'alex@example.com';
  const initial = displayName.charAt(0).toUpperCase();
  const [isTogglingTracking, setIsTogglingTracking] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState(displayName);
  const [editUsername, setEditUsername] = useState('');
  const [usernameUpdatedAt, setUsernameUpdatedAt] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'available' | 'taken' | 'invalid' | 'short' | 'unchanged'>('idle');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [optimisticTracking, setOptimisticTracking] = useState(isTracking);
  const [currentLang, setCurrentLang] = useState<Language>(getCurrentLanguage());
  const batterySaver = mode === 'low_power';

  async function handleTrackingToggle(enabled: boolean) {
    if (!user?.id || isTogglingTracking) return;
    setOptimisticTracking(enabled);
    setIsTogglingTracking(true);
    try {
      if (enabled) {
        const started = await startTracking(user.id);
        setTracking(started);
        if (!started) setOptimisticTracking(false);
      } else {
        await stopTracking();
        setTracking(false);
      }
    } catch {
      setOptimisticTracking(isTracking);
      Alert.alert(t('common.error'), t('profile.trackingError'));
    } finally {
      setIsTogglingTracking(false);
    }
  }

  async function handleBatterySaverToggle(enabled: boolean) {
    setTrackingMode(enabled ? 'low_power' : 'high_accuracy');
    if (isTracking && user?.id) {
      await restartTracking(user.id);
    }
  }

  async function handleExport() {
    if (!user?.id) return;
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await exportVisitSessionsCSV(user.id, from, to);
    } catch {
      Alert.alert(t('profile.exportFailed'), t('profile.exportError'));
    }
  }

  function handleNotifications() {
    Linking.openSettings().catch(() => {
      Alert.alert(t('profile.openSettings'), t('profile.notificationsSettings'));
    });
  }

  const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
  const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

  const canChangeUsername = !usernameUpdatedAt ||
    Date.now() - new Date(usernameUpdatedAt).getTime() > COOLDOWN_MS;

  const daysUntilChange = usernameUpdatedAt && !canChangeUsername
    ? Math.ceil((COOLDOWN_MS - (Date.now() - new Date(usernameUpdatedAt).getTime())) / (24 * 60 * 60 * 1000))
    : 0;

  useEffect(() => {
    if (!editModalVisible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = editUsername.trim().toLowerCase();
    if (trimmed === (user?.username ?? '')) { setUsernameStatus('unchanged'); return; }
    if (!trimmed) { setUsernameStatus('idle'); return; }
    if (trimmed.length < 3) { setUsernameStatus('short'); return; }
    if (!USERNAME_REGEX.test(trimmed)) { setUsernameStatus('invalid'); return; }

    setIsCheckingUsername(true);
    setUsernameStatus('idle');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('username', trimmed)
          .maybeSingle();
        setIsCheckingUsername(false);
        setUsernameStatus(data ? 'taken' : 'available');
      } catch {
        setIsCheckingUsername(false);
        setUsernameStatus('idle');
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [editUsername, editModalVisible]);

  function handleEditProfile() {
    setEditName(displayName);
    setEditUsername(user?.username ?? '');
    setUsernameStatus('idle');
    setUsernameUpdatedAt(null);
    setEditModalVisible(true);
    // Fetch cooldown info after modal is already open
    if (user?.id) {
      supabase
        .from('user_profiles')
        .select('username_updated_at')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => setUsernameUpdatedAt(data?.username_updated_at ?? null));
    }
  }

  async function handleSaveProfile() {
    const name = editName.trim();
    const newUsername = editUsername.trim().toLowerCase();
    if (!name || !user?.id) return;
    setIsSaving(true);
    try {
      const profileUpdates: Record<string, any> = { display_name: name };
      if (newUsername && newUsername !== user.username && canChangeUsername && usernameStatus === 'available') {
        profileUpdates.username = newUsername;
        profileUpdates.username_updated_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(profileUpdates)
        .eq('user_id', user.id);
      if (error) throw error;

      // Update auth metadata in background — non-blocking, never awaited
      supabase.auth.updateUser({ data: { display_name: name } }).catch(() => {});

      updateProfile({
        displayName: name,
        ...(profileUpdates.username ? { username: profileUpdates.username } : {}),
      });
      setEditModalVisible(false);
    } catch {
      Alert.alert(t('common.error'), 'Could not update profile.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLanguageSelect(lang: Language) {
    await changeLanguage(lang);
    setCurrentLang(lang);
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Header */}
          <View style={styles.header}>
            <SectionLabel text={t('profile.sectionLabel')} color={COLORS.primary} />
            <Text style={styles.title}>{t('profile.title')}</Text>
          </View>

          {/* Avatar card */}
          <View style={styles.avatarCard}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.avatarBorder} />
            <View style={styles.avatarContent}>
              <View style={styles.avatarRing}>
                <LinearGradient colors={GRADIENTS.primary} style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{initial}</Text>
                </LinearGradient>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{displayName}</Text>
                {user?.username ? (
                  <Text style={styles.userHandle}>@{user.username}</Text>
                ) : null}
                <Text style={styles.userEmail}>{email}</Text>
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={handleEditProfile}>
                <Ionicons name="pencil" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Plan */}
          <Text style={styles.groupTitle}>Plan</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            {userPlan === 'premium' ? (
              <View style={styles.planRow}>
                <View style={[styles.menuIconWrap, { backgroundColor: '#FFD70018' }]}>
                  <Ionicons name="star" size={18} color="#FFD700" />
                </View>
                <Text style={styles.menuLabel}>Premium</Text>
                <Text style={styles.planBadge}>Active</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.planRow} onPress={() => setPaywallVisible(true)} activeOpacity={0.75}>
                <View style={[styles.menuIconWrap, { backgroundColor: `${COLORS.textMuted}18` }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuLabel}>Free Plan</Text>
                  <Text style={styles.planSub}>Upgrade to unlock all features</Text>
                </View>
                <View style={styles.upgradeChip}>
                  <Text style={styles.upgradeChipText}>Upgrade 👑</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Tracking */}
          <Text style={styles.groupTitle}>{t('profile.trackingGroup')}</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            <MenuRow
              icon="location"
              iconColor={isTracking ? COLORS.success : COLORS.primary}
              label={t('profile.locationTracking')}
              isToggle
              toggleValue={optimisticTracking}
              onToggle={handleTrackingToggle}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="battery-half"
              iconColor={COLORS.success}
              label={t('profile.batterySaver')}
              isToggle
              toggleValue={batterySaver}
              onToggle={handleBatterySaverToggle}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="sync"
              iconColor={COLORS.accent}
              label={t('profile.syncFrequency')}
              value={t('profile.syncValue')}
            />
          </View>

          {/* Language */}
          <Text style={styles.groupTitle}>{t('profile.languageGroup')}</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            {LANGUAGES.map((lang, i) => (
              <View key={lang.code}>
                {i > 0 && <View style={styles.divider} />}
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={() => handleLanguageSelect(lang.code)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: `${COLORS.primary}18` }]}>
                    <Ionicons
                      name={currentLang === lang.code ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={currentLang === lang.code ? COLORS.primary : COLORS.textMuted}
                    />
                  </View>
                  <Text style={[styles.menuLabel, currentLang === lang.code && { color: COLORS.primary }]}>
                    {lang.nativeLabel}
                  </Text>
                  {currentLang === lang.code && (
                    <Ionicons name="checkmark" size={16} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Data */}
          <Text style={styles.groupTitle}>{t('profile.dataGroup')}</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            <MenuRow icon="shield-checkmark" iconColor={COLORS.success} label={t('profile.privacyCenter')} onPress={() => router.push('/privacy')} />
            <View style={styles.divider} />
            <MenuRow icon="sparkles" iconColor={COLORS.warning} label={t('profile.insights')} onPress={() => router.push('/insights')} />
            <View style={styles.divider} />
            <MenuRow icon="download-outline" iconColor={COLORS.accent} label={t('profile.exportData')} onPress={handleExport} />
          </View>

          {/* Account */}
          <Text style={styles.groupTitle}>{t('profile.accountGroup')}</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            <MenuRow icon="notifications-outline" iconColor={COLORS.primary} label={t('profile.notifications')} onPress={handleNotifications} />
            <View style={styles.divider} />
            <MenuRow icon="log-out-outline" iconColor={COLORS.error} label={t('profile.signOut')} danger onPress={signOut} />
          </View>

          <Text style={styles.version}>{t('common.version')}</Text>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.modalCard}>
            <View style={styles.modalCardBorder} />
            <Text style={styles.modalTitle}>{t('profile.editProfile')}</Text>

            <Text style={styles.modalLabel}>{t('profile.displayNameLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder={t('profile.displayNameLabel')}
              placeholderTextColor={COLORS.textMuted}
              autoFocus
              maxLength={40}
            />

            <Text style={styles.modalLabel}>{t('profile.usernameLabel')}</Text>
            <View style={styles.modalInputRow}>
              <TextInput
                style={[styles.modalInput, styles.modalInputFlex, !canChangeUsername && styles.modalInputDisabled]}
                value={editUsername}
                onChangeText={(v) => setEditUsername(v.toLowerCase().replace(/\s/g, ''))}
                placeholder="@username"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={canChangeUsername}
                maxLength={30}
              />
              {isCheckingUsername && (
                <ActivityIndicator size="small" color={COLORS.primary} style={styles.modalSpinner} />
              )}
            </View>

            {!canChangeUsername ? (
              <Text style={styles.modalCooldown}>{t('profile.usernameChangeCooldown', { days: daysUntilChange })}</Text>
            ) : usernameStatus !== 'idle' && usernameStatus !== 'unchanged' ? (
              <Text style={[styles.modalStatusText, {
                color: usernameStatus === 'available' ? COLORS.success : COLORS.error,
              }]}>
                {usernameStatus === 'available' ? t('username.available')
                  : usernameStatus === 'taken' ? t('username.taken')
                  : usernameStatus === 'invalid' ? t('username.invalid')
                  : t('username.tooShort')}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditModalVisible(false)} activeOpacity={0.7}>
                <Text style={styles.modalBtnCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave, (isSaving || isCheckingUsername) && styles.modalBtnDisabled]}
                onPress={handleSaveProfile}
                activeOpacity={0.7}
                disabled={isSaving || isCheckingUsername}
              >
                <Text style={styles.modalBtnSaveText}>{isSaving ? t('common.loading') : t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <PaywallScreen visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },

  header: { paddingTop: SPACING.md, marginBottom: SPACING.lg },
  title: { color: COLORS.textPrimary, fontSize: FONT.sizes.xxl, fontWeight: FONT.weights.black, marginTop: 4 },

  avatarCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.lg,
  },
  avatarBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: `${COLORS.primary}60`,
  },
  avatar: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: COLORS.textPrimary, fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold },
  userInfo: { flex: 1 },
  userName: { color: COLORS.textPrimary, fontSize: FONT.sizes.lg, fontWeight: FONT.weights.semibold },
  userHandle: { color: COLORS.primary, fontSize: FONT.sizes.sm, marginTop: 1 },
  userEmail: { color: COLORS.textMuted, fontSize: FONT.sizes.sm, marginTop: 1 },
  editBtn: { padding: SPACING.xs },

  groupTitle: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
    marginLeft: 4,
  },
  menuCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.lg,
  },
  menuBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.medium,
  },
  menuLabelDanger: { color: COLORS.error },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  menuValue: { color: COLORS.textMuted, fontSize: FONT.sizes.sm },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: SPACING.md + 34 + SPACING.sm },
  version: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalCard: {
    width: '85%',
    borderRadius: RADIUS.xl,
    backgroundColor: '#1A1A2E',
    padding: SPACING.lg,
    overflow: 'hidden',
  },
  modalCardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.bold,
    marginBottom: SPACING.md,
  },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  modalBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
  },
  modalBtnCancel: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.medium,
  },
  modalBtnSave: {
    backgroundColor: COLORS.primary,
  },
  modalBtnSaveText: {
    color: COLORS.textPrimary,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
  },
  modalBtnDisabled: { opacity: 0.5 },
  modalLabel: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  modalInputRow: { position: 'relative', marginBottom: SPACING.md },
  modalInputFlex: { marginBottom: 0 },
  modalInputDisabled: { opacity: 0.4 },
  modalSpinner: { position: 'absolute', right: SPACING.md, top: 10 },
  modalCooldown: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },
  modalStatusText: {
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.medium,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },

  // Plan section
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  planBadge: {
    color: '#FFD700',
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
    backgroundColor: '#FFD70020',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFD70040',
  },
  planSub: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    marginTop: 2,
  },
  upgradeChip: {
    backgroundColor: '#FFD70018',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FFD70040',
  },
  upgradeChipText: {
    color: '#FFD700',
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
  },
});
