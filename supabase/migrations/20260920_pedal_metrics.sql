-- Dual-sided pedaling from Garmin FIT / Connect (balance, TE, smoothness, phase).
alter table public.activities
  add column if not exists pedal_metrics jsonb;
