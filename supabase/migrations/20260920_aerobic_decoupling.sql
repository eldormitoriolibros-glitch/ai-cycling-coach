-- Aerobic decoupling (Pw:Hr) per ride, so the drift can be trended over months.
-- `decoupling_status` records *why* a ride has no number, which keeps the
-- backfill from re-reading the samples of every interval session on every run.
alter table public.activities
  add column if not exists decoupling_percent numeric,
  add column if not exists decoupling_seconds int,
  add column if not exists decoupling_status text
    check (decoupling_status is null
           or decoupling_status in ('ok', 'no_power', 'too_short', 'too_hard'));

-- The trend chart reads only the judged rides, newest first.
create index if not exists activities_decoupling_idx
  on public.activities (user_id, start_time desc)
  where decoupling_status = 'ok';
