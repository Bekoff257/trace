/**
 * useRealtimeFriends — subscribes to Supabase Realtime for:
 *   - friends' live locations  (instant, no polling)
 *   - profile changes
 *   - incoming friend requests  (friendships INSERT where friend_id = me)
 *   - accepted outgoing requests (friendships UPDATE where user_id  = me)
 *
 * A 60-second safety-net refresh runs in parallel to recover from any
 * missed realtime events (e.g. brief network drop, subscription restart).
 */
import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@services/supabaseClient';
import { useFriendsStore } from '@stores/friendsStore';
import { speedToStatus } from '@services/friendLocationPublisher';
import { showLocalNotification } from '@services/notificationService';
import type { FriendLocation, FriendProfile } from '@/types/index';

const SAFETY_REFETCH_MS = 60_000; // fallback full-fetch interval

export function useRealtimeFriends(userId: string | undefined) {
  const { fetchFriends, fetchPendingRequests, upsertLocation, upsertProfile } = useFriendsStore();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchFriends(userId);
    fetchPendingRequests(userId);

    const channel = supabase
      .channel(`friends:${userId}`)

      // ── Live friend locations ─────────────────────────────────────────────
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

      // ── Friend profile changes ────────────────────────────────────────────
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
            username: row.username ?? undefined,
          };
          upsertProfile(profile);
        }
      )

      // ── Someone sent ME a friend request ─────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
          filter: `friend_id=eq.${userId}`,
        },
        async (payload) => {
          const senderId = (payload.new as any).user_id;
          // Refresh pending list so it appears immediately on the Friends screen
          fetchPendingRequests(userId);
          // Fire a local notification with the sender's name
          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('display_name')
              .eq('user_id', senderId)
              .maybeSingle();
            showLocalNotification(
              'New Friend Request',
              `${profile?.display_name ?? 'Someone'} wants to be your friend`,
              { type: 'friend_request' },
            );
          } catch {}
        }
      )

      // ── My outgoing request was accepted ─────────────────────────────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'friendships',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if ((payload.new as any).status === 'accepted') {
            // New friend appears on the map and Friends list immediately
            fetchFriends(userId);
            showLocalNotification(
              'Friend Request Accepted!',
              'You have a new friend — check the Friends screen',
              { type: 'friend_accepted' },
            );
          }
        }
      )

      .subscribe((status) => {
        // If the channel drops, re-fetch to ensure no missed events
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          fetchFriends(userId);
        }
      });

    channelRef.current = channel;

    // Safety-net: re-fetch full friend list every 60 s to catch any missed
    // realtime events (network blip, subscription restart, etc.)
    const safetyTimer = setInterval(() => {
      fetchFriends(userId);
    }, SAFETY_REFETCH_MS);

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      clearInterval(safetyTimer);
    };
  }, [userId]);
}
