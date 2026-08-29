-- Garmin becomes the primary activity source: allow 'garmin' rows, track backfill
-- progress, and capture the extra session fields only Garmin provides.
begin;

-- Activities may now originate directly from Garmin, not just Strava/manual FIT
alter table public.activities drop constraint if exists activities_source_check;
alter table public.activities
  add constraint activities_source_check
  check (source in ('strava', 'manual', 'garmin'));

-- Extra Garmin session metrics
alter table public.activities add column if not exists sweat_loss_ml numeric;
alter table public.activities add column if not exists garmin_training_load numeric;

-- Historical backfill progress, so a long import can resume instead of restarting
alter table public.garmin_connections add column if not exists backfill_status text
  not null default 'idle'
  check (backfill_status in ('idle', 'running', 'done', 'error'));
alter table public.garmin_connections add column if not exists backfill_cursor int not null default 0;
alter table public.garmin_connections add column if not exists backfill_processed int not null default 0;
alter table public.garmin_connections add column if not exists backfill_error text;
alter table public.garmin_connections add column if not exists backfill_started_at timestamptz;
alter table public.garmin_connections add column if not exists backfill_finished_at timestamptz;

-- Backfill walks activities newest-first; matching hits start_time constantly
create index if not exists activities_user_start_time_idx
  on public.activities (user_id, start_time desc);

commit;
