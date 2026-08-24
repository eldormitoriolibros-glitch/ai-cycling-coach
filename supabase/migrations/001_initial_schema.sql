-- =============================================================================
-- 001 — Initial schema
--
-- Apply with either:
--   supabase db reset                (local CLI)
--   or paste into the Supabase SQL editor on a FRESH project
--
-- Notes:
--  * Never touch the `auth` schema. Supabase manages RLS there itself.
--  * Every policy declares BOTH `using` and `with check` so a user cannot
--    insert or update a row that points at somebody else's user_id.
--  * `updated_at` is maintained by a trigger, not by the application.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;

begin;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- users — profile row mirroring auth.users
-- -----------------------------------------------------------------------------

create table public.users (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text,
  name              text,
  age               int check (age is null or age between 10 and 120),
  sex               text check (sex is null or sex in ('male', 'female', 'other')),
  weight_kg         numeric check (weight_kg is null or weight_kg > 0),
  height_cm         numeric check (height_cm is null or height_cm > 0),
  experience_level  text check (experience_level is null or experience_level in ('beginner', 'intermediate', 'advanced')),
  cycling_goals     text[] not null default '{}',
  timezone          text not null default 'UTC',
  locale            text not null default 'es' check (locale in ('es', 'en')),
  telegram_chat_id  bigint unique,
  telegram_link_code text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users_select_own" on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy "users_update_own" on public.users
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create the profile row when someone signs up.
-- `security definer` + a pinned search_path so the function cannot be hijacked
-- by a caller-controlled search_path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- athlete_metrics
-- -----------------------------------------------------------------------------

create table public.athlete_metrics (
  user_id     uuid primary key references public.users(id) on delete cascade,
  ftp         int     check (ftp is null or ftp between 50 and 700),
  max_hr      int     check (max_hr is null or max_hr between 100 and 250),
  resting_hr  int     check (resting_hr is null or resting_hr between 25 and 120),
  vo2max      numeric check (vo2max is null or vo2max between 10 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.athlete_metrics enable row level security;

create policy "athlete_metrics_own" on public.athlete_metrics
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger athlete_metrics_set_updated_at
  before update on public.athlete_metrics
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- availability — one row per weekday (0 = Sunday)
-- -----------------------------------------------------------------------------

create table public.availability (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  day_of_week          smallint not null check (day_of_week between 0 and 6),
  available            boolean not null default false,
  start_time           time not null default '08:00',
  end_time             time not null default '09:00',
  max_duration_minutes int not null default 60 check (max_duration_minutes between 0 and 1440),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, day_of_week),
  constraint availability_window_valid check (end_time > start_time)
);

alter table public.availability enable row level security;

create policy "availability_own" on public.availability
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger availability_set_updated_at
  before update on public.availability
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- strava_connections — OAuth tokens, encrypted by the app before insert
-- -----------------------------------------------------------------------------

create table public.strava_connections (
  user_id                 uuid primary key references public.users(id) on delete cascade,
  athlete_id              bigint unique,
  access_token_encrypted  text not null,
  refresh_token_encrypted text not null,
  expires_at              timestamptz not null,
  scopes                  text,
  connection_status       text not null default 'connected'
                            check (connection_status in ('connected', 'expired', 'revoked', 'error')),
  last_sync_at            timestamptz,
  last_sync_error         text,
  connected_at            timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.strava_connections enable row level security;

-- Read/delete only from the client. Tokens are written server-side with the
-- service role, so the browser can never mint or overwrite credentials.
create policy "strava_connections_select_own" on public.strava_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "strava_connections_delete_own" on public.strava_connections
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger strava_connections_set_updated_at
  before update on public.strava_connections
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- activities
-- -----------------------------------------------------------------------------

create table public.activities (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  source                text not null check (source in ('strava', 'manual')),
  external_id           text not null,
  activity_type         text,
  sport_type            text,
  title                 text,
  description           text,
  start_time            timestamptz not null,
  timezone              text,
  duration_seconds      int,
  moving_seconds        int,
  distance_meters       numeric,
  elevation_gain_meters numeric,
  avg_power             numeric,
  normalized_power      numeric,
  max_power             numeric,
  kilojoules            numeric,
  has_power_meter       boolean not null default false,
  avg_hr                int,
  max_hr                int,
  avg_cadence           int,
  max_cadence           int,
  avg_speed             numeric,
  max_speed             numeric,
  training_load         numeric,
  intensity_factor      numeric,
  perceived_exertion    int check (perceived_exertion is null or perceived_exertion between 1 and 10),
  is_trainer            boolean not null default false,
  raw_data_reference    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, source, external_id)
);

alter table public.activities enable row level security;

create policy "activities_own" on public.activities
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index idx_activities_user_start on public.activities (user_id, start_time desc);

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- activity_samples — per-second streams
-- -----------------------------------------------------------------------------

create table public.activity_samples (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.users(id) on delete cascade,
  activity_id   uuid not null references public.activities(id) on delete cascade,
  offset_seconds int not null,
  heart_rate    int,
  power         numeric,
  cadence       int,
  speed         numeric,
  latitude      numeric,
  longitude     numeric,
  elevation     numeric,
  unique (activity_id, offset_seconds)
);

alter table public.activity_samples enable row level security;

create policy "activity_samples_own" on public.activity_samples
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index idx_samples_activity on public.activity_samples (activity_id, offset_seconds);

-- -----------------------------------------------------------------------------
-- sleep / recovery
-- -----------------------------------------------------------------------------

create table public.sleep (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  date               date not null,
  source             text not null default 'manual',
  duration_minutes   int,
  sleep_score        int check (sleep_score is null or sleep_score between 0 and 100),
  deep_sleep_minutes int,
  rem_sleep_minutes  int,
  awake_minutes      int,
  created_at         timestamptz not null default now(),
  unique (user_id, date, source)
);

alter table public.sleep enable row level security;

create policy "sleep_own" on public.sleep
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.recovery_metrics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  date            date not null,
  source          text not null default 'manual',
  resting_hr      int,
  hrv             numeric,
  stress          int,
  soreness        int check (soreness is null or soreness between 1 and 10),
  motivation      int check (motivation is null or motivation between 1 and 10),
  recovery_status text,
  created_at      timestamptz not null default now(),
  unique (user_id, date, source)
);

alter table public.recovery_metrics enable row level security;

create policy "recovery_metrics_own" on public.recovery_metrics
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- training_load — derived daily aggregates (CTL / ATL / TSB)
-- -----------------------------------------------------------------------------

create table public.training_load (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  date          date not null,
  daily_load    numeric not null default 0,
  acute_load    numeric,
  chronic_load  numeric,
  form          numeric,
  ramp_rate     numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.training_load enable row level security;

create policy "training_load_own" on public.training_load
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger training_load_set_updated_at
  before update on public.training_load
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workouts
-- -----------------------------------------------------------------------------

create table public.workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  scheduled_date   date not null,
  workout_type     text,
  title            text,
  description      text,
  duration_minutes int,
  target_zone      text,
  target_power     numeric,
  target_hr        int,
  target_cadence   int,
  purpose          text,
  rationale        text,
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'completed', 'skipped', 'moved')),
  completed_activity_id uuid references public.activities(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.workouts enable row level security;

create policy "workouts_own" on public.workouts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index idx_workouts_user_date on public.workouts (user_id, scheduled_date);

create trigger workouts_set_updated_at
  before update on public.workouts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- training_plans
-- -----------------------------------------------------------------------------

create table public.training_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text,
  description text,
  start_date  date,
  end_date    date,
  plan_data   jsonb not null default '{}',
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.training_plans enable row level security;

create policy "training_plans_own" on public.training_plans
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger training_plans_set_updated_at
  before update on public.training_plans
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- coach_messages — conversation log across web + telegram
-- -----------------------------------------------------------------------------

create table public.coach_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  direction  text not null check (direction in ('inbound', 'outbound')),
  channel    text not null default 'web' check (channel in ('web', 'telegram')),
  message    text not null,
  intent     text,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.coach_messages enable row level security;

create policy "coach_messages_own" on public.coach_messages
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index idx_coach_messages_user on public.coach_messages (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- sync_logs — audit trail for provider syncs
-- -----------------------------------------------------------------------------

create table public.sync_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  source         text not null,
  trigger        text not null check (trigger in ('manual', 'webhook', 'cron')),
  status         text not null check (status in ('success', 'partial', 'error')),
  activities_synced int not null default 0,
  error_message  text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

alter table public.sync_logs enable row level security;

create policy "sync_logs_select_own" on public.sync_logs
  for select to authenticated using (user_id = (select auth.uid()));

create index idx_sync_logs_user on public.sync_logs (user_id, started_at desc);

commit;
