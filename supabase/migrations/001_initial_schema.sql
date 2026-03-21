-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Users Profile (extends auth.users) ────────────────────────────────────────
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null default '',
  avatar_url    text,
  home_lat      float8,
  home_lng      float8,
  work_lat      float8,
  work_lng      float8,
  timezone      text not null default 'UTC',
  tracking_mode text not null default 'always' check (tracking_mode in ('always','battery_saver','off')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.users enable row level security;
create policy "Users can view own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Location Points ────────────────────────────────────────────────────────────
create table public.location_points (
  id          bigserial primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  lat         float8 not null,
  lng         float8 not null,
  accuracy    float4,
  speed       float4,
  altitude    float4,
  heading     float4,
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create index location_points_user_time on public.location_points (user_id, recorded_at desc);

alter table public.location_points enable row level security;
create policy "Users can manage own points" on public.location_points
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Visit Sessions ─────────────────────────────────────────────────────────────
create table public.visit_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  place_name            text not null,
  place_category        text not null default 'other',
  lat                   float8 not null,
  lng                   float8 not null,
  address               text,
  started_at            timestamptz not null,
  ended_at              timestamptz,
  duration_min          int,
  distance_from_prev_m  float4,
  created_at            timestamptz not null default now()
);

create index visit_sessions_user_time on public.visit_sessions (user_id, started_at desc);

alter table public.visit_sessions enable row level security;
create policy "Users can manage own sessions" on public.visit_sessions
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Daily Summaries ────────────────────────────────────────────────────────────
create table public.daily_summaries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  date              date not null,
  total_distance_m  float4 not null default 0,
  steps_estimated   int not null default 0,
  places_visited    int not null default 0,
  time_outside_min  int not null default 0,
  time_home_min     int not null default 0,
  time_work_min     int not null default 0,
  top_place         text,
  points_count      int not null default 0,
  updated_at        timestamptz not null default now(),
  unique (user_id, date)
);

create index daily_summaries_user_date on public.daily_summaries (user_id, date desc);

alter table public.daily_summaries enable row level security;
create policy "Users can manage own summaries" on public.daily_summaries
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
