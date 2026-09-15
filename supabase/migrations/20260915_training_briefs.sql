-- Training brief: goal, horizon and strength flag the coach learns in conversation.
-- Availability stays on public.availability; this table is the "why" of the cycle.
begin;

create table public.training_briefs (
  user_id           uuid primary key references public.users(id) on delete cascade,
  goal_kind         text not null check (goal_kind in ('maintenance', 'ftp', 'race', 'return')),
  goal_label        text,
  target_date       date,
  horizon_weeks     smallint not null check (horizon_weeks in (4, 8, 12)),
  include_strength  boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.training_briefs enable row level security;

create policy "training_briefs_own" on public.training_briefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger training_briefs_set_updated_at
  before update on public.training_briefs
  for each row execute function public.set_updated_at();

commit;
