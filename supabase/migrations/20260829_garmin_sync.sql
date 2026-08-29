-- Garmin Connect sync: connection tokens, activity enrichment columns, health columns
begin;

-- Garmin connection tokens (OAuth refresh tokens, encrypted)
create table if not exists public.garmin_connections (
  user_id         uuid primary key references public.users(id) on delete cascade,
  garmin_email    text not null,
  tokens_encrypted text not null,
  last_sync_at    timestamptz,
  last_sync_error text,
  sync_enabled    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.garmin_connections enable row level security;

create policy "garmin_connections_own" on public.garmin_connections
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Activity enrichment columns (from FIT / Garmin)
alter table public.activities add column if not exists avg_temperature numeric;
alter table public.activities add column if not exists max_temperature numeric;
alter table public.activities add column if not exists training_effect_aerobic numeric;
alter table public.activities add column if not exists training_effect_anaerobic numeric;
alter table public.activities add column if not exists avg_respiration_rate numeric;
alter table public.activities add column if not exists calories numeric;

-- Activity samples: respiration rate from FIT
alter table public.activity_samples add column if not exists respiration_rate numeric;

-- Recovery metrics: Garmin daily health data
alter table public.recovery_metrics add column if not exists body_battery_high int;
alter table public.recovery_metrics add column if not exists body_battery_low int;
alter table public.recovery_metrics add column if not exists spo2_avg numeric;
alter table public.recovery_metrics add column if not exists vo2max_cycling numeric;

commit;
