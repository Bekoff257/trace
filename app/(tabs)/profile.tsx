import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Linking } from 'react-native';
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
import { startTracking, stopTracking } from '@services/locationService';

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
  const { user, signOut } = useAuthStore();
  const { isTracking, mode, setTrackingMode } = useLocationStore();
  const displayName = user?.displayName ?? 'Alex';
  const email = user?.email ?? 'alex@example.com';
  const initial = displayName.charAt(0).toUpperCase();
  const [isTogglingTracking, setIsTogglingTracking] = useState(false);
  const batterySaver = mode === 'low_power';

  async function handleTrackingToggle(enabled: boolean) {
    if (!user?.id || isTogglingTracking) return;
    setIsTogglingTracking(true);
    try {
      if (enabled) {
        await startTracking(user.id);
      } else {
        await stopTracking();
      }
    } catch {
      Alert.alert('Error', 'Could not change tracking status.');
    } finally {
      setIsTogglingTracking(false);
    }
  }

  function handleBatterySaverToggle(enabled: boolean) {
    setTrackingMode(enabled ? 'low_power' : 'high_accuracy');
  }

  async function handleExport() {
    if (!user?.id) return;
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await exportVisitSessionsCSV(user.id, from, to);
    } catch {
      Alert.alert('Export failed', 'Could not export your data. Please try again.');
    }
  }

  function handleNotifications() {
    Linking.openSettings().catch(() => {
      Alert.alert('Open Settings', 'Go to Settings → Notifications → Location Tracker to manage notifications.');
    });
  }

  function handleEditProfile() {
    Alert.alert('Edit Profile', 'Profile editing coming soon.');
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0D0D1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Header */}
          <View style={styles.header}>
            <SectionLabel text="PROFILE" color={COLORS.primary} />
            <Text style={styles.title}>Account</Text>
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

          {/* Tracking Settings */}
          <Text style={styles.groupTitle}>TRACKING</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            <MenuRow
              icon="location"
              iconColor={isTracking ? COLORS.success : COLORS.primary}
              label="Location Tracking"
              isToggle
              toggleValue={isTracking}
              onToggle={handleTrackingToggle}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="battery-half"
              iconColor={COLORS.success}
              label="Battery Saver Mode"
              isToggle
              toggleValue={batterySaver}
              onToggle={handleBatterySaverToggle}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="sync"
              iconColor={COLORS.accent}
              label="Sync Frequency"
              value="15 min"
            />
          </View>

          {/* Data */}
          <Text style={styles.groupTitle}>DATA</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            <MenuRow icon="shield-checkmark" iconColor={COLORS.success} label="Privacy Center" onPress={() => router.push('/privacy')} />
            <View style={styles.divider} />
            <MenuRow icon="sparkles" iconColor={COLORS.warning} label="Insights" onPress={() => router.push('/insights')} />
            <View style={styles.divider} />
            <MenuRow icon="download-outline" iconColor={COLORS.accent} label="Export My Data" onPress={handleExport} />
          </View>

          {/* Account */}
          <Text style={styles.groupTitle}>ACCOUNT</Text>
          <View style={styles.menuCard}>
            <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuBorder} />
            <MenuRow icon="notifications-outline" iconColor={COLORS.primary} label="Notifications" onPress={handleNotifications} />
            <View style={styles.divider} />
            <MenuRow icon="log-out-outline" iconColor={COLORS.error} label="Sign Out" danger onPress={signOut} />
          </View>

          <Text style={styles.version}>Location History Tracker v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>
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
});
