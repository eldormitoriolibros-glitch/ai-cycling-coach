-- Create power_curve_snapshots table for weekly power curve snapshots
create table if not exists power_curve_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  snapshot_date date not null,
  window_days int not null default 90,
  curve jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date, window_days)
);

create index if not exists idx_power_curve_snapshots_user_date
  on power_curve_snapshots (user_id, snapshot_date desc);

