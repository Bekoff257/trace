import { create } from 'zustand';
import type { Friend, FriendLocation, FriendProfile } from '@/types/index';
import { supabase } from '@services/supabaseClient';
import { speedToStatus } from '@services/friendLocationPublisher';

interface FriendsState {
  friends: Friend[];
  setFriends: (friends: Friend[]) => void;
  upsertLocation: (userId: string, location: FriendLocation) => void;
  upsertProfile: (profile: FriendProfile) => void;
  fetchFriends: (userId: string) => Promise<void>;
  sendFriendRequest: (userId: string, friendEmail: string) => Promise<string | null>;
  acceptFriendRequest: (friendshipId: string) => Promise<void>;
  removeFriend: (userId: string, friendId: string) => Promise<void>;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],

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

  sendFriendRequest: async (userId, friendEmail) => {
    try {
      // Look up friend's user_id by email via user_profiles + auth
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .ilike('display_name', friendEmail)
        .maybeSingle();

      if (!profile) return 'User not found. Ask them to share their invite link.';
      if (profile.user_id === userId) return 'You can\'t add yourself as a friend.';

      const { error } = await supabase.from('friendships').insert({
        user_id: userId,
        friend_id: profile.user_id,
        status: 'pending',
      });

      if (error) return error.message;
      return null;
    } catch (e: any) {
      return e?.message ?? 'Unknown error';
    }
  },

  acceptFriendRequest: async (friendshipId) => {
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
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
