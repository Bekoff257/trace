/**
 * useRealtimeFriends — subscribes to Supabase Realtime for friends' live locations
 * and profile updates. Updates the friendsStore on every change.
 */
import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@services/supabaseClient';
import { useFriendsStore } from '@stores/friendsStore';
import { speedToStatus } from '@services/friendLocationPublisher';
import type { FriendLocation, FriendProfile } from '@/types/index';

export function useRealtimeFriends(userId: string | undefined) {
  const { fetchFriends, upsertLocation, upsertProfile } = useFriendsStore();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchFriends(userId);

    // Subscribe to real-time changes on friend_locations and user_profiles
    const channel = supabase
      .channel(`friends:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_locations' },
        (payload) => {
          const row = payload.new as any;
          if (!row?.user_id || row.user_id === userId) return;

          const location: FriendLocation = {
            userId: row.user_id,
            lat: row.lat,
            lng: row.lng,
            speed: row.speed ?? 0,
            heading: row.heading ?? undefined,
            batteryLevel: row.battery_level ?? undefined,
            isCharging: row.is_charging ?? false,
            updatedAt: row.updated_at,
            status: speedToStatus(row.speed ?? 0),
          };
          upsertLocation(row.user_id, location);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        (payload) => {
          const row = payload.new as any;
          if (!row?.user_id || row.user_id === userId) return;

          const profile: FriendProfile = {
            userId: row.user_id,
            displayName: row.display_name,
            avatarUrl: row.avatar_url ?? undefined,
          };
          upsertProfile(profile);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [userId]);
}
