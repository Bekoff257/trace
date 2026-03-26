/**
 * push-notifications — Supabase Edge Function
 *
 * Triggered by Database Webhooks on:
 *   • friend_locations (INSERT/UPDATE) — low battery alert
 *   • friendships      (INSERT/UPDATE) — friend request / accepted
 *
 * Webhook payload shape: { type, table, record, old_record }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
}

async function sendPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

async function getDisplayName(userId: string): Promise<string> {
  // Check user_profiles first (new users), fall back to users (legacy)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (profile?.display_name) return profile.display_name;

  const { data: user } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  return user?.display_name ?? 'Someone';
}

async function getPushToken(userId: string): Promise<string | null> {
  // user_profiles is more up-to-date for new users
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('push_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (profile?.push_token) return profile.push_token;

  const { data: user } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle();
  return user?.push_token ?? null;
}

async function getFriendTokens(userId: string): Promise<string[]> {
  const { data: friendships } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (!friendships?.length) return [];

  const friendIds = friendships.map((f) =>
    f.user_id === userId ? f.friend_id : f.user_id
  );

  // Collect tokens from both tables; user_profiles wins (more up-to-date)
  const [profilesRes, usersRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('user_id, push_token')
      .in('user_id', friendIds)
      .not('push_token', 'is', null),
    supabase
      .from('users')
      .select('id, push_token')
      .in('id', friendIds)
      .not('push_token', 'is', null),
  ]);

  const tokenMap = new Map<string, string>();
  for (const u of (usersRes.data ?? [])) {
    if (u.push_token) tokenMap.set(u.id, u.push_token);
  }
  for (const p of (profilesRes.data ?? [])) {
    if (p.push_token) tokenMap.set(p.user_id, p.push_token);
  }

  return [...tokenMap.values()];
}





// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleLocationUpdate(record: Record<string, unknown>): Promise<void> {
  const userId = record.user_id as string;
  const battery = record.battery_level as number | null;

  if (battery === null || battery > 0.2) return;

  const tokens = await getFriendTokens(userId);
  if (!tokens.length) return;

  const name = await getDisplayName(userId);
  const pct = Math.round(battery * 100);

  await sendPush(
    tokens.map((to) => ({
      to,
      title: `${name}'s battery is low`,
      body: `${name} is at ${pct}% — they may go offline soon`,
      data: { type: 'low_battery', userId },
      sound: 'default',
    }))
  );
}

async function handleFriendship(
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null
): Promise<void> {
  const { user_id, friend_id, status } = record as {
    user_id: string;
    friend_id: string;
    status: string;
  };

  if (status === 'pending') {
    // New friend request — notify the recipient
    const token = await getPushToken(friend_id);
    if (!token) return;

    const senderName = await getDisplayName(user_id);
    await sendPush([{
      to: token,
      title: 'New friend request',
      body: `${senderName} wants to share their location with you`,
      data: { type: 'friend_request', fromUserId: user_id },
      sound: 'default',
    }]);
  } else if (status === 'accepted' && oldRecord?.status === 'pending') {
    // Request accepted — notify the original requester
    const token = await getPushToken(user_id);
    if (!token) return;

    const acceptorName = await getDisplayName(friend_id);
    await sendPush([{
      to: token,
      title: 'Friend request accepted',
      body: `${acceptorName} accepted your request — you can now see each other on the map`,
      data: { type: 'friend_accepted', fromUserId: friend_id },
      sound: 'default',
    }]);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const { table, record, old_record } = payload;

    if (table === 'friend_locations') {
      await handleLocationUpdate(record);
    } else if (table === 'friendships') {
      await handleFriendship(record, old_record ?? null);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[push-notifications]', err);
    return new Response('error', { status: 500 });
  }
});
