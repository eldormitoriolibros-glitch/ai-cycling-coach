-- Time in zone per ride, so weekly 80/20 can be read without paging samples.
-- Status records why a ride has no number, so the backfill does not re-read
-- every spin without a pulse.
alter table public.activities
  add column if not exists zone_seconds jsonb,
  add column if not exists zone_seconds_status text
    check (zone_seconds_status is null
           or zone_seconds_status in ('ok', 'no_signal'));

create index if not exists activities_zone_seconds_idx
  on public.activities (user_id, start_time desc)
  where zone_seconds_status = 'ok';
