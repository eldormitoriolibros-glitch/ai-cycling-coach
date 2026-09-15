-- Strength setup and recurring niggles for cycle planning (coach brief).
begin;

alter table public.training_briefs
  add column if not exists strength_equipment text,
  add column if not exists recurring_issues text;

alter table public.training_briefs
  drop constraint if exists training_briefs_strength_equipment_check;

alter table public.training_briefs
  add constraint training_briefs_strength_equipment_check
  check (strength_equipment is null or strength_equipment in ('gym', 'home', 'bodyweight'));

commit;
