/**
 * useRealtimeFriends — subscribes to Supabase Realtime for:
 *   - friends' live locations  (instant, no polling)
 *   - profile changes
 *   - incoming friend requests  (friendships INSERT where friend_id = me)
 *   - accepted outgoing requests (friendships UPDATE where user_id  = me)
 *
 * Reliability layers:
 *   1. Realtime postgres_changes subscription (primary, instant)
 *   2. 30-second safety-net poll (catches any missed events)
 *   3. AppState foreground listener (re-fetches after background period)
 *   4. CHANNEL_ERROR / TIMED_OUT recovery (immediate re-fetch + channel reset)
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@services/supabaseClient';
import { useFriendsStore } from '@stores/friendsStore';
import { speedToStatus } from '@services/friendLocationPublisher';
import { showLocalNotification } from '@services/notificationService';
import type { FriendLocation, FriendProfile } from '@/types/index';

const SAFETY_REFETCH_MS = 30_000; // fallback poll interval

export function useRealtimeFriends(userId: string | undefined) {
  const { fetchFriends, fetchPendingRequests, upsertLocation, upsertProfile } = useFriendsStore();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    console.log('[RealtimeFriends] Initialising for userId:', userId);
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

          console.log(
            `[RealtimeFriends] Location update for ${row.user_id}` +
            ` lat=${row.lat?.toFixed(5)} lng=${row.lng?.toFixed(5)}` +
            ` battery=${row.battery_level} updated_at=${row.updated_at}`,
          );

          const location: FriendLocation = {
            userId:       row.user_id,
            lat:          row.lat,
            lng:          row.lng,
            speed:        row.speed ?? 0,
            heading:      row.heading ?? undefined,
            batteryLevel: row.battery_level ?? undefined,
            isCharging:   row.is_charging ?? false,
            updatedAt:    row.updated_at,
            status:       speedToStatus(row.speed ?? 0),
          };
          upsertLocation(row.user_id, location);
        },
      )

      // ── Friend profile changes ────────────────────────────────────────────
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        (payload) => {
          const row = payload.new as any;
          if (!row?.user_id || row.user_id === userId) return;

          console.log('[RealtimeFriends] Profile update for', row.user_id);

          const profile: FriendProfile = {
            userId:      row.user_id,
            displayName: row.display_name,
            avatarUrl:   row.avatar_url ?? undefined,
            username:    row.username ?? undefined,
          };
          upsertProfile(profile);
        },
      )

      // ── Someone sent ME a friend request ─────────────────────────────────
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'friendships',
          filter: `friend_id=eq.${userId}`,
        },
        async (payload) => {
          const senderId = (payload.new as any).user_id;
          console.log('[RealtimeFriends] Incoming friend request from', senderId);
          fetchPendingRequests(userId);
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
        },
      )

      // ── My outgoing request was accepted ─────────────────────────────────
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'friendships',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if ((payload.new as any).status === 'accepted') {
            console.log('[RealtimeFriends] Friend request accepted by', (payload.new as any).friend_id);
            fetchFriends(userId);
            showLocalNotification(
              'Friend Request Accepted!',
              'You have a new friend — check the Friends screen',
              { type: 'friend_accepted' },
            );
          }
        },
      )

      .subscribe((status) => {
        console.log('[RealtimeFriends] Channel status:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[RealtimeFriends] Connection issue — re-fetching friends');
          fetchFriends(userId);
        }
      });

    channelRef.current = channel;

    // Safety-net: poll every 30 s to catch any missed realtime events
    const safetyTimer = setInterval(() => {
      console.log('[RealtimeFriends] Safety poll — re-fetching friends');
      fetchFriends(userId);
    }, SAFETY_REFETCH_MS);

    // Re-fetch when app returns to foreground (covers background sleep gaps)
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        console.log('[RealtimeFriends] App foregrounded — re-fetching friends');
        fetchFriends(userId);
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      clearInterval(safetyTimer);
      appStateSub.remove();
    };
  }, [userId]);
}
