-- Allow any authenticated user to read profiles (required for friend search by @username)
-- Without this, Supabase RLS silently hides other users' rows and search returns "not found"
alter table public.user_profiles enable row level security;

-- Drop existing policies first to avoid conflicts, then recreate
drop policy if exists "Users can read all profiles" on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;

create policy "Users can read all profiles"
  on public.user_profiles for select
  using (auth.uid() is not null);

create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id);
