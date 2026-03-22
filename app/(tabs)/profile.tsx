import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Linking, Modal, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, changeLanguage, getCurrentLanguage, type Language } from '@i18n/index';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@stores/authStore';
import { useLocationStore } from '@stores/locationStore';
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
  const { user, signOut } = useAuthStore();
  const { isTracking, mode, setTrackingMode, setTracking } = useLocationStore();
  const displayName = user?.displayName ?? 'Alex';
  const email = user?.email ?? 'alex@example.com';
  const initial = displayName.charAt(0).toUpperCase();
  const [isTogglingTracking, setIsTogglingTracking] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState(displayName);
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

  async function handleSaveName() {
    const name = editName.trim();
    if (!name) return;
    try {
      const { supabase } = await import('@services/supabaseClient');
      await supabase.auth.updateUser({ data: { display_name: name } });
      setEditModalVisible(false);
    } catch {
      Alert.alert(t('common.error'), 'Could not update name.');
    }
  }

  function handleEditProfile() {
    setEditName(displayName);
    setEditModalVisible(true);
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
                <Text style={styles.userEmail}>{email}</Text>
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={handleEditProfile}>
                <Ionicons name="pencil" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
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
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Display name"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
              maxLength={40}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditModalVisible(false)} activeOpacity={0.7}>
                <Text style={styles.modalBtnCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveName} activeOpacity={0.7}>
                <Text style={styles.modalBtnSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  userEmail: { color: COLORS.textMuted, fontSize: FONT.sizes.sm, marginTop: 2 },
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
});
