-- =============================================================================
-- 004 — GPS route + Strava segment efforts
--
-- `activity_samples.latitude/longitude` already existed but were never
-- populated. This migration only adds storage for segment efforts; the GPS
-- columns are reused as-is.
-- =============================================================================

alter table public.activities
  add column if not exists segment_efforts jsonb;
