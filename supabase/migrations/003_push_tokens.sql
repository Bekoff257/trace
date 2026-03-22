-- Add push token column to users table
alter table public.users add column if not exists push_token text;

-- Users can update their own push token (already covered by existing update policy)
-- No new RLS needed — existing "Users can update own profile" policy applies
