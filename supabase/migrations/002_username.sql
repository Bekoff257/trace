-- Add username to user_profiles
alter table public.user_profiles
  add column if not exists username text unique;

-- Track when username was last changed (for 14-day cooldown)
alter table public.user_profiles
  add column if not exists username_updated_at timestamptz;

-- Index for fast lookup by username (used in friend search)
create index if not exists user_profiles_username on public.user_profiles (username);
