import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '@services/supabaseClient';
import { useFriendsStore } from '@stores/friendsStore';
import { useAuthStore } from '@stores/authStore';
import { useAlert } from '@components/ui/CustomAlert';
import { COLORS, FONT, SPACING, RADIUS, GRADIENTS, SHADOWS } from '@constants/theme';
import type { Friend } from '@/types/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function getLastSeen(updatedAt: string, t: (key: string, opts?: any) => string): string {
  const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
  if (diff < 60) return t('friends.activeNow');
  if (diff < 3600) return t('friends.minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('friends.hoursAgo', { count: Math.floor(diff / 3600) });
  return t('friends.daysAgo', { count: Math.floor(diff / 86400) });
}

function statusLabel(status: string, t: (key: string) => string) {
  if (status === 'driving') return `🚗 ${t('friends.driving')}`;
  if (status === 'walking') return `🚶 ${t('friends.walking')}`;
  return `• ${t('friends.stationary')}`;
}

function batteryColor(level: number, charging: boolean) {
  if (charging) return COLORS.success;
  if (level < 0.2) return COLORS.error;
  if (level < 0.4) return COLORS.warning;
  return COLORS.success;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FriendRow({ friend, onRemove }: { friend: Friend; onRemove: () => void }) {
  const { t } = useTranslation();
  const loc = friend.location;
  const isOnline = loc
    ? Date.now() - new Date(loc.updatedAt).getTime() < 5 * 60 * 1000
    : false;

  return (
    <View style={styles.friendRow}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.friendRowBorder} />

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {friend.avatarUrl ? (
          <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.initials}>{getInitials(friend.displayName)}</Text>
          </View>
        )}
        <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.success : COLORS.textMuted }]} />
      </View>

      {/* Info */}
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{friend.displayName}</Text>
        {loc ? (
          <Text style={styles.friendSub}>
            {statusLabel(loc.status, t)} · {getLastSeen(loc.updatedAt, t)}
          </Text>
        ) : (
          <Text style={styles.friendSub}>{t('friends.locationNotShared')}</Text>
        )}
      </View>

      {/* Battery */}
      {loc?.batteryLevel != null && (
        <View style={styles.batteryCol}>
          <Ionicons
            name={loc.isCharging ? 'battery-charging' : 'battery-half'}
            size={16}
            color={batteryColor(loc.batteryLevel, !!loc.isCharging)}
          />
          <Text style={[styles.batteryPct, { color: batteryColor(loc.batteryLevel, !!loc.isCharging) }]}>
            {Math.round(loc.batteryLevel * 100)}%
          </Text>
        </View>
      )}

      {/* Remove */}
      <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="person-remove-outline" size={16} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function PendingRow({
  senderName,
  onAccept,
}: {
  userId: string;
  senderId: string;
  senderName: string;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.pendingRow}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.friendRowBorder} />
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Text style={styles.initials}>{getInitials(senderName)}</Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{senderName}</Text>
        <Text style={styles.friendSub}>{t('friends.wantsToBeYourFriend')}</Text>
      </View>
      <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.8}>
        <LinearGradient colors={GRADIENTS.primary} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
        <Text style={styles.acceptBtnText}>{t('friends.accept')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { friends, fetchFriends, removeFriend, acceptFriendRequest, sendFriendRequest } = useFriendsStore();
  const { show: showAlert, element: alertElement } = useAlert();

  const [addUsername, setAddUsername] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<
    { id: string; userId: string; displayName: string }[]
  >([]);
  const [loadingPending, setLoadingPending] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchFriends(user.id);
      fetchPending(user.id);
    }
  }, [user?.id]);

  const fetchPending = async (userId: string) => {
    setLoadingPending(true);
    try {
      const { data } = await supabase
        .from('friendships')
        .select('id, user_id')
        .eq('friend_id', userId)
        .eq('status', 'pending');

      if (!data?.length) { setPendingRequests([]); return; }

      const senderIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', senderIds);

      const rows = data.map((r) => ({
        id: r.id,
        userId: r.user_id,
        displayName: profiles?.find((p) => p.user_id === r.user_id)?.display_name ?? 'Unknown',
      }));
      setPendingRequests(rows);
    } finally {
      setLoadingPending(false);
    }
  };

  const handleSendRequest = async () => {
    if (!user?.id || !addUsername.trim()) return;
    setAddLoading(true);
    const err = await sendFriendRequest(user.id, addUsername.trim());
    setAddLoading(false);
    setAddUsername('');
    if (err) {
      showAlert({ title: t('friends.notFound'), message: err, icon: 'alert-circle-outline', iconColor: COLORS.warning });
    } else {
      showAlert({ title: t('friends.requestSent'), message: t('friends.sendError').replace('Could not send', 'Sent'), icon: 'checkmark-circle-outline', iconColor: COLORS.success });
    }
  };

  const handleAccept = async (req: { id: string; userId: string; displayName: string }) => {
    await acceptFriendRequest(req.id);
    setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
    if (user?.id) fetchFriends(user.id);
  };

  const handleRemove = async (friendId: string, name: string) => {
    showAlert({
      title: t('friends.removeTitle', { name }),
      message: t('friends.removeBody'),
      icon: 'person-remove-outline',
      iconColor: COLORS.error,
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('friends.remove'),
          style: 'destructive',
          onPress: () => { if (user?.id) removeFriend(user.id, friendId); },
        },
      ],
    });
  };

  const handleShareInvite = async () => {
    if (!user) return;
    try {
      const handle = user.username ? `@${user.username}` : user.id;
      await Share.share({
        message: `Add me on Trace! My username: ${handle}\n\nOpen the app → Friends → search by username.`,
        title: 'Join me on Trace',
      });
    } catch {}
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#06060E', '#0A0A14', '#06060E']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>{t('friends.title')}</Text>
            <Text style={styles.headerSub}>{t('friends.connected', { count: friends.length })}</Text>
          </View>
          <TouchableOpacity onPress={handleShareInvite} style={styles.shareBtn} activeOpacity={0.8}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.shareBorder} />
            <Ionicons name="person-add-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Add Friend */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('friends.addFriend').toUpperCase()}</Text>
            <View style={styles.addRow}>
              <View style={styles.inputWrap}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.inputBorder} />
                <Ionicons name="at-outline" size={16} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('friends.addPlaceholder')}
                  placeholderTextColor={COLORS.textMuted}
                  value={addUsername}
                  onChangeText={setAddUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSendRequest}
                />
              </View>
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={handleSendRequest}
                activeOpacity={0.8}
                disabled={addLoading || !addUsername.trim()}
              >
                <LinearGradient colors={GRADIENTS.primary} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                {addLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>

            {/* Share own code */}
            <TouchableOpacity style={styles.inviteCard} onPress={handleShareInvite} activeOpacity={0.8}>
              <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.inviteBorder} />
              <Ionicons name="link-outline" size={16} color={COLORS.accent} />
              <Text style={styles.inviteText}>{t('friends.inviteLink')}</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Pending Requests */}
          {!loadingPending && pendingRequests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('friends.pendingRequests')} ({pendingRequests.length})</Text>
              {pendingRequests.map((req) => (
                <PendingRow
                  key={req.id}
                  userId={user?.id ?? ''}
                  senderId={req.userId}
                  senderName={req.displayName}
                  onAccept={() => handleAccept(req)}
                />
              ))}
            </View>
          )}

          {/* Friends List */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {friends.length > 0
                ? `${t('friends.myFriends')} (${friends.length})`
                : t('friends.emptyFriends').toUpperCase()}
            </Text>
            {friends.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <LinearGradient colors={GRADIENTS.primary} style={StyleSheet.absoluteFill} />
                  <Ionicons name="people-outline" size={28} color="#fff" />
                </View>
                <Text style={styles.emptyTitle}>{t('friends.addFirstFriend')}</Text>
                <Text style={styles.emptySub}>{t('friends.addFirstFriendSub')}</Text>
              </View>
            ) : (
              friends.map((f) => (
                <FriendRow
                  key={f.userId}
                  friend={f}
                  onRemove={() => handleRemove(f.userId, f.displayName)}
                />
              ))
            )}
          </View>

        </ScrollView>
      </SafeAreaView>

      {alertElement}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060E' },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.md, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: { color: COLORS.textPrimary, fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold },
  headerSub: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, marginTop: 1 },
  shareBtn: {
    marginLeft: 'auto',
    width: 40, height: 40, borderRadius: RADIUS.full,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.glass,
  },
  shareBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
  },

  section: { marginBottom: SPACING.lg },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold, letterSpacing: 1.2,
    marginBottom: SPACING.sm,
  },

  addRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  inputWrap: {
    flex: 1, height: 48, borderRadius: RADIUS.md, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.glass,
  },
  inputBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  inputIcon: { marginLeft: SPACING.sm },
  input: {
    flex: 1, color: COLORS.textPrimary,
    fontSize: FONT.sizes.md, paddingHorizontal: SPACING.sm,
  },
  sendBtn: {
    width: 48, height: 48, borderRadius: RADIUS.md,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.primary,
  },

  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.md, overflow: 'hidden',
    backgroundColor: COLORS.glass,
  },
  inviteBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: `${COLORS.accent}40`,
  },
  inviteText: {
    flex: 1, color: COLORS.accent,
    fontSize: FONT.sizes.sm, fontWeight: FONT.weights.medium,
  },

  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.lg, overflow: 'hidden',
    backgroundColor: COLORS.glass, marginBottom: SPACING.xs,
  },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.lg, overflow: 'hidden',
    backgroundColor: COLORS.glass, marginBottom: SPACING.xs,
  },
  friendRowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
  },

  avatarWrap: { position: 'relative' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: `${COLORS.primary}60`,
  },
  avatarPlaceholder: {
    backgroundColor: `${COLORS.primary}22`,
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { color: COLORS.primary, fontSize: 15, fontWeight: FONT.weights.bold },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: '#06060E',
  },

  friendInfo: { flex: 1 },
  friendName: { color: COLORS.textPrimary, fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold },
  friendSub: { color: COLORS.textMuted, fontSize: FONT.sizes.xs, marginTop: 2 },

  batteryCol: { alignItems: 'center', gap: 2 },
  batteryPct: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold },

  removeBtn: { padding: 4 },

  acceptBtn: {
    height: 34, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { color: '#fff', fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },

  emptyState: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
  emptySub: { color: COLORS.textMuted, fontSize: FONT.sizes.sm, textAlign: 'center', lineHeight: 20 },
});
