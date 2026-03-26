import { create } from 'zustand';
import type { Friend, FriendLocation, FriendProfile } from '@/types/index';
import { supabase } from '@services/supabaseClient';
import { speedToStatus } from '@services/friendLocationPublisher';
import { getPushToken, sendPushNotification } from '@services/notificationService';

export interface PendingRequest {
  id: string;
  userId: string;
  displayName: string;
}

interface FriendsState {
  friends: Friend[];
  pendingRequests: PendingRequest[];
  setFriends: (friends: Friend[]) => void;
  upsertLocation: (userId: string, location: FriendLocation) => void;
  upsertProfile: (profile: FriendProfile) => void;
  fetchFriends: (userId: string) => Promise<void>;
  fetchPendingRequests: (userId: string) => Promise<void>;
  removePendingRequest: (id: string) => void;
  sendFriendRequest: (userId: string, friendEmail: string) => Promise<string | null>;
  acceptFriendRequest: (friendshipId: string, currentUserId?: string) => Promise<void>;
  removeFriend: (userId: string, friendId: string) => Promise<void>;
}

// ─── Stale detection ──────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 60_000; // location is considered stale after 60 s

/**
 * Returns true if a friend's location has not been updated in > 60 seconds.
 * Use this in UI components to switch from "live" to "last seen" display.
 */
export function isFriendStale(updatedAt: string | undefined): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS;
}

/**
 * Returns a human-readable "last seen" string, or null if the location is fresh.
 * Examples: "Just now", "2 min ago", "15 min ago"
 */
export function getLastSeenText(updatedAt: string | undefined): string {
  if (!updatedAt) return 'Unknown';
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  if (diffMs < 10_000) return 'Just now';
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  const mins = Math.floor(diffMs / 60_000);
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

// ─── Push notifications ───────────────────────────────────────────────────────

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  pendingRequests: [],

  setFriends: (friends) => set({ friends }),

  upsertLocation: (userId, location) =>
    set((state) => ({
      friends: state.friends.map((f) =>
        f.userId === userId ? { ...f, location } : f
      ),
    })),

  upsertProfile: (profile) =>
    set((state) => ({
      friends: state.friends.map((f) =>
        f.userId === profile.userId ? { ...f, ...profile } : f
      ),
    })),

  fetchFriends: async (userId) => {
    try {
      // Get all accepted friendships where this user is either side
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('id, user_id, friend_id, status')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error || !friendships?.length) {
        set({ friends: [] });
        return;
      }

      // Collect the other person's ID from each friendship
      const friendIds = friendships.map((f) =>
        f.user_id === userId ? f.friend_id : f.user_id
      );

      // Fetch profiles + latest locations in parallel
      const [profilesRes, locationsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').in('user_id', friendIds),
        supabase.from('friend_locations').select('*').in('user_id', friendIds),
      ]);

      const profiles = profilesRes.data ?? [];
      const locations = locationsRes.data ?? [];

      const friends: Friend[] = friendIds.map((fid) => {
        const profile = profiles.find((p) => p.user_id === fid);
        const loc = locations.find((l) => l.user_id === fid);
        const friendship = friendships.find(
          (f) => f.user_id === fid || f.friend_id === fid
        );

        return {
          userId: fid,
          displayName: profile?.display_name ?? 'Unknown',
          avatarUrl: profile?.avatar_url ?? undefined,
          username: profile?.username ?? undefined,
          friendshipStatus: friendship?.status ?? 'accepted',
          location: loc
            ? {
                userId: fid,
                lat: loc.lat,
                lng: loc.lng,
                speed: loc.speed ?? 0,
                heading: loc.heading ?? undefined,
                batteryLevel: loc.battery_level ?? undefined,
                isCharging: loc.is_charging ?? false,
                updatedAt: loc.updated_at,
                status: speedToStatus(loc.speed ?? 0),
              }
            : undefined,
        };
      });

      set({ friends });
    } catch (e) {
      console.warn('[FriendsStore] fetchFriends failed:', e);
    }
  },

  fetchPendingRequests: async (userId) => {
    try {
      const { data } = await supabase
        .from('friendships')
        .select('id, user_id')
        .eq('friend_id', userId)
        .eq('status', 'pending');

      if (!data?.length) { set({ pendingRequests: [] }); return; }

      const senderIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', senderIds);

      set({
        pendingRequests: data.map((r) => ({
          id: r.id,
          userId: r.user_id,
          displayName: profiles?.find((p) => p.user_id === r.user_id)?.display_name ?? 'Unknown',
        })),
      });
    } catch {}
  },

  removePendingRequest: (id) =>
    set((state) => ({ pendingRequests: state.pendingRequests.filter((r) => r.id !== id) })),

  sendFriendRequest: async (userId, friendEmail) => {
    try {
      // Look up friend's user_id by username (strip leading @ if present)
      const username = friendEmail.trim().replace(/^@/, '').toLowerCase();
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .eq('username', username)
        .maybeSingle();

      if (error) return `Search failed: ${error.message}`;
      if (!profile) return 'User not found. Ask them to share their @username.';
      if (profile.user_id === userId) return 'You can\'t add yourself as a friend.';

      const { error: insertError } = await supabase.from('friendships').insert({
        user_id: userId,
        friend_id: profile.user_id,
        status: 'pending',
      });

      if (insertError) return insertError.message;

      // Notify recipient via push
      try {
        const [senderRes, recipientToken] = await Promise.all([
          supabase.from('user_profiles').select('display_name').eq('user_id', userId).maybeSingle(),
          getPushToken(profile.user_id),
        ]);
        if (recipientToken) {
          sendPushNotification(
            recipientToken,
            'New Friend Request',
            `${senderRes.data?.display_name ?? 'Someone'} wants to be your friend`,
            { type: 'friend_request' },
            profile.user_id,  // pass recipient ID for DeviceNotRegistered cleanup
          );
        }
      } catch {}

      return null;
    } catch (e: any) {
      return e?.message ?? 'Unknown error';
    }
  },

  acceptFriendRequest: async (friendshipId, currentUserId?) => {
    // Fetch the friendship first to know who sent it
    const { data: friendship } = await supabase
      .from('friendships')
      .select('user_id')
      .eq('id', friendshipId)
      .maybeSingle();

    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    // Refresh local friends list immediately
    if (currentUserId) get().fetchFriends(currentUserId);

    // Notify the original sender that their request was accepted
    if (friendship?.user_id) {
      try {
        const [senderToken, acceptorNameRes] = await Promise.all([
          getPushToken(friendship.user_id),
          currentUserId
            ? supabase.from('user_profiles').select('display_name').eq('user_id', currentUserId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (senderToken) {
          sendPushNotification(
            senderToken,
            'Friend Request Accepted!',
            `${acceptorNameRes.data?.display_name ?? 'Someone'} accepted your friend request`,
            { type: 'friend_accepted' },
            friendship.user_id, // pass sender ID for DeviceNotRegistered cleanup
          );
        }
      } catch {}
    }
  },

  removeFriend: async (userId, friendId) => {
    await supabase
      .from('friendships')
      .delete()
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`
      );
    set((state) => ({
      friends: state.friends.filter((f) => f.userId !== friendId),
    }));
  },
}));
