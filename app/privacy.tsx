import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, RADIUS } from '@constants/theme';
import SectionLabel from '@components/ui/SectionLabel';
import { useAuthStore } from '@stores/authStore';
import { deleteAllUserData } from '@services/localDB';
import { startAutoSync, stopAutoSync } from '@services/syncService';

interface PrivacyToggleProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function PrivacyToggle({ icon, iconColor, title, description, value, onChange, disabled }: PrivacyToggleProps) {
  return (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <View style={[styles.toggleIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={18} color={disabled ? COLORS.textMuted : iconColor} />
      </View>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleTitle, disabled && styles.textDisabled]}>{title}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: COLORS.glass, true: COLORS.primary }}
        thumbColor={COLORS.textPrimary}
      />
    </View>
  );
}

export default function PrivacyScreen() {
  const { user } = useAuthStore();
  const [syncCloud, setSyncCloud] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [crashReports, setCrashReports] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleSyncToggle(enabled: boolean) {
    setSyncCloud(enabled);
    if (enabled && user?.id) {
      startAutoSync(user.id);
    } else {
      stopAutoSync();
    }
  }

  function handleDeleteData() {
    Alert.alert(
      'Delete All Data',
      'This will permanently delete all your location history from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            setIsDeleting(true);
            try {
              await deleteAllUserData(user.id);
              Alert.alert('Done', 'All location data has been deleted from this device.');
            } catch {
              Alert.alert('Error', 'Failed to delete data. Please try again.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <SectionLabel text="PRIVACY" color={COLORS.success} style={styles.pill} />
            <Text style={styles.title}>Privacy Center</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Privacy badge */}
          <View style={styles.badgeCard}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={[`${COLORS.success}20`, 'transparent']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.badgeBorder} />
            <View style={styles.badgeContent}>
              <View style={styles.shieldWrap}>
                <LinearGradient colors={[COLORS.success, '#00A070']} style={styles.shieldGrad}>
                  <Ionicons name="shield-checkmark" size={24} color={COLORS.textPrimary} />
                </LinearGradient>
              </View>
              <View style={styles.badgeText}>
                <Text style={styles.badgeTitle}>Your data is protected</Text>
                <Text style={styles.badgeDesc}>All location data is stored locally on your device and encrypted at rest.</Text>
              </View>
            </View>
          </View>

          {/* Data storage */}
          <Text style={styles.sectionTitle}>DATA STORAGE</Text>
          <View style={styles.card}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.cardBorder} />
            <PrivacyToggle
              icon="phone-portrait-outline"
              iconColor={COLORS.primary}
              title="Store on Device"
              description="Always enabled — core app functionality"
              value={true}
              onChange={() => {}}
              disabled
            />
            <View style={styles.divider} />
            <PrivacyToggle
              icon="cloud-outline"
              iconColor={COLORS.accent}
              title="Sync to Cloud"
              description="Backup your history securely to Supabase"
              value={syncCloud}
              onChange={handleSyncToggle}
            />
          </View>

          {/* Analytics */}
          <Text style={styles.sectionTitle}>ANALYTICS</Text>
          <View style={styles.card}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.cardBorder} />
            <PrivacyToggle
              icon="bar-chart-outline"
              iconColor={COLORS.warning}
              title="Usage Analytics"
              description="Help improve the app with anonymous usage data"
              value={analytics}
              onChange={setAnalytics}
            />
            <View style={styles.divider} />
            <PrivacyToggle
              icon="bug-outline"
              iconColor={COLORS.error}
              title="Crash Reports"
              description="Send anonymized crash logs to help fix bugs"
              value={crashReports}
              onChange={setCrashReports}
            />
          </View>

          {/* Retention */}
          <Text style={styles.sectionTitle}>DATA RETENTION</Text>
          <View style={styles.card}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.cardBorder} />
            {[
              { label: 'Raw GPS points', value: '7 days locally' },
              { label: 'Visit sessions', value: 'Forever' },
              { label: 'Daily summaries', value: 'Forever' },
            ].map((row, i, arr) => (
              <View key={i}>
                <View style={styles.retentionRow}>
                  <Text style={styles.retentionLabel}>{row.label}</Text>
                  <Text style={styles.retentionValue}>{row.value}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          {/* Danger zone */}
          <Text style={styles.sectionTitle}>DANGER ZONE</Text>
          <TouchableOpacity
            style={[styles.deleteBtn, isDeleting && styles.deleteBtnDisabled]}
            onPress={handleDeleteData}
            activeOpacity={0.8}
            disabled={isDeleting}
          >
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.deleteBorder} />
            {isDeleting ? (
              <ActivityIndicator color={COLORS.error} size="small" />
            ) : (
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            )}
            <Text style={styles.deleteLabel}>
              {isDeleting ? 'Deleting…' : 'Delete All Location Data'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  pill: { alignSelf: 'center' },
  title: { color: COLORS.textPrimary, fontSize: FONT.sizes.xxl, fontWeight: FONT.weights.black, marginTop: 2 },

  scroll: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xxl },

  badgeCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.lg,
  },
  badgeBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: `${COLORS.success}40`,
  },
  badgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  shieldWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  shieldGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeText: { flex: 1 },
  badgeTitle: { color: COLORS.textPrimary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold, marginBottom: 3 },
  badgeDesc: { color: COLORS.textSecondary, fontSize: FONT.sizes.sm, lineHeight: 18 },

  sectionTitle: {
    color: COLORS.textMuted,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
    marginLeft: 4,
  },
  card: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.glass,
    marginBottom: SPACING.lg,
  },
  cardBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  toggleRowDisabled: { opacity: 0.5 },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { flex: 1 },
  toggleTitle: { color: COLORS.textPrimary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.medium },
  textDisabled: { color: COLORS.textMuted },
  toggleDesc: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, marginTop: 2, lineHeight: 16 },

  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: SPACING.md },

  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  retentionLabel: { color: COLORS.textSecondary, fontSize: FONT.sizes.md },
  retentionValue: { color: COLORS.textMuted, fontSize: FONT.sizes.sm },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: `${COLORS.error}10`,
    padding: SPACING.md,
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: `${COLORS.error}40`,
  },
  deleteLabel: { color: COLORS.error, fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold },
});
