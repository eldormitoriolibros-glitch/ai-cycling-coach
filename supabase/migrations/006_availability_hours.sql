-- =============================================================================
-- 006 — Availability as daily hours (bike + optional strength), not time windows
--
-- Replaces the day_of_week + start_time/end_time/max_duration_minutes model
-- with two simple duration fields per day: how much time is available for
-- cycling, and (optionally) for strength work. The athlete manages the exact
-- clock schedule themselves; the app only needs total capacity per day.
-- =============================================================================

alter table public.availability
  add column if not exists bike_minutes int not null default 0 check (bike_minutes between 0 and 1440),
  add column if not exists strength_minutes int not null default 0 check (strength_minutes between 0 and 1440);

-- Carry over existing data: a day marked available keeps its max duration as bike time.
update public.availability
set bike_minutes = max_duration_minutes
where available is true and bike_minutes = 0;

alter table public.availability
  drop column if exists available,
  drop column if exists start_time,
  drop column if exists end_time,
  drop column if exists max_duration_minutes;
