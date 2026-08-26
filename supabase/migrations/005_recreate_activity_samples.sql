-- =============================================================================
-- 005 — Recreate activity_samples (dropped by 002) + segment efforts
--
-- Migration 002 dropped `activity_samples` when the app briefly pivoted to
-- storing only a compact power curve per activity. The app was later
-- extended to render per-second charts, GPS routes and Strava segments again,
-- which need this table back.
--
-- This migration is self-sufficient: run it even if 002, 003 or 004 were
-- never applied. Every statement is idempotent (safe to re-run).
-- =============================================================================

create table if not exists public.activity_samples (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.users(id) on delete cascade,
  activity_id    uuid not null references public.activities(id) on delete cascade,
  offset_seconds int not null,
  heart_rate     int,
  power          numeric,
  cadence        int,
  speed          numeric,
  latitude       numeric,
  longitude      numeric,
  elevation      numeric,
  temperature    numeric,
  unique (activity_id, offset_seconds)
);

-- In case the table already existed but predates temperature/lat/lng.
alter table public.activity_samples
  add column if not exists temperature numeric,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

alter table public.activity_samples enable row level security;

drop policy if exists "activity_samples_own" on public.activity_samples;
create policy "activity_samples_own" on public.activity_samples
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists idx_samples_activity on public.activity_samples (activity_id, offset_seconds);

alter table public.activities
  add column if not exists segment_efforts jsonb;
