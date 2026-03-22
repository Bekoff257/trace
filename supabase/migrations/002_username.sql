-- Add username to user_profiles
alter table public.user_profiles
  add column if not exists username text unique;

-- Index for fast lookup by username (used in friend search)
create index if not exists user_profiles_username on public.user_profiles (username);
