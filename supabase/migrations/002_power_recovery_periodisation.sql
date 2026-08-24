-- =============================================================================
-- 002 — Power curve, FTP estimation, recovery input, periodisation
--
-- Run after 001. Safe to re-run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Per-second samples are not stored. Instead each activity keeps a compact
-- mean-maximal power curve: ~6 numbers instead of ~7000 rows per ride.
-- -----------------------------------------------------------------------------

drop table if exists public.activity_samples;

alter table public.activities
  add column if not exists power_curve jsonb,
  add column if not exists streams_fetched_at timestamptz,
  add column if not exists streams_status text
    check (streams_status is null or streams_status in ('ok', 'no_power', 'error'));

-- Only rides that still need a stream fetch.
create index if not exists idx_activities_pending_streams
  on public.activities (user_id, start_time desc)
  where has_power_meter and power_curve is null;

-- -----------------------------------------------------------------------------
-- FTP provenance: distinguishes a value you typed from one this app estimated.
-- -----------------------------------------------------------------------------

alter table public.athlete_metrics
  add column if not exists ftp_source text not null default 'manual'
    check (ftp_source in ('manual', 'estimated')),
  add column if not exists ftp_updated_at timestamptz;

-- -----------------------------------------------------------------------------
-- Periodisation: one row per committed week, so the planner can see how many
-- loading weeks came before this one.
-- -----------------------------------------------------------------------------

create table if not exists public.plan_weeks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  start_date     date not null,
  end_date       date not null,
  emphasis       text not null check (emphasis in ('recovery', 'maintenance', 'build')),
  block_position int not null default 1 check (block_position between 1 and 8),
  target_load    numeric not null default 0,
  planned_load   numeric not null default 0,
  rationale      text,
  created_at     timestamptz not null default now(),
  unique (user_id, start_date)
);

alter table public.plan_weeks enable row level security;

drop policy if exists "plan_weeks_own" on public.plan_weeks;
create policy "plan_weeks_own" on public.plan_weeks
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists idx_plan_weeks_user on public.plan_weeks (user_id, start_date desc);

-- -----------------------------------------------------------------------------
-- Subjective daily input. `sleep` and `recovery_metrics` already exist; these
-- indexes make the "latest N days" lookups the coach does cheap.
-- -----------------------------------------------------------------------------

create index if not exists idx_sleep_user_date on public.sleep (user_id, date desc);
create index if not exists idx_recovery_user_date on public.recovery_metrics (user_id, date desc);

commit;
