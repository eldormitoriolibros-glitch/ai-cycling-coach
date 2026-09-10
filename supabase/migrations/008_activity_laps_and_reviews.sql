-- =============================================================================
-- 008 — Per-lap splits for activities + post-session review bookkeeping
--
-- Garmin and Strava both expose the athlete's own lap button as ride splits.
-- Storing them lets the coach analyse each interval (power, HR, cadence)
-- instead of judging a structured session by its whole-ride averages.
--
-- Every statement is idempotent (safe to re-run).
-- =============================================================================

create table if not exists public.activity_laps (
  id                     bigint generated always as identity primary key,
  user_id                uuid not null references public.users(id) on delete cascade,
  activity_id            uuid not null references public.activities(id) on delete cascade,
  lap_index              int not null,
  start_offset_seconds   int,
  elapsed_seconds        numeric,
  moving_seconds         numeric,
  distance_meters        numeric,
  avg_speed              numeric,
  max_speed              numeric,
  avg_hr                 int,
  max_hr                 int,
  avg_cadence            int,
  max_cadence            int,
  avg_power              numeric,
  max_power              numeric,
  normalized_power       numeric,
  elevation_gain_meters  numeric,
  elevation_loss_meters  numeric,
  calories               numeric,
  avg_temperature        numeric,
  lap_trigger            text,
  intensity              text,
  unique (activity_id, lap_index)
);

alter table public.activity_laps enable row level security;

drop policy if exists "activity_laps_own" on public.activity_laps;
create policy "activity_laps_own" on public.activity_laps
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists idx_laps_activity on public.activity_laps (activity_id, lap_index);

-- One post-session review per workout, so retries and the nightly job can't spam.
alter table public.workouts
  add column if not exists review_sent_at timestamptz;
