-- 007 — Add username to users and populate from email local-part
begin;

alter table public.users add column if not exists username text;

-- Populate existing rows using local-part of email
update public.users
set username = lower(split_part(email, '@', 1))
where username is null and email is not null;

-- Enforce uniqueness on username (allows multiple nulls)
-- Make usernames unique: deduplicate then add constraint if possible.
-- First, ensure duplicates are resolved by appending a numeric suffix for duplicate local-parts.
with ranked as (
  select id, username, row_number() over (partition by username order by created_at) as rn
  from public.users
  where username is not null
)
update public.users u
set username = u.username || '_' || ranked.rn
from ranked
where u.id = ranked.id and ranked.rn > 1;

-- Add unique constraint only if it does not already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_username_unique'
  ) then
    alter table public.users add constraint users_username_unique unique (username);
  end if;
end
$$;

-- Replace handle_new_user to populate username at creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, name, username)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    lower(split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Reinstate trigger (idempotent) only if it does not already exist.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then
    execute '
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_new_user();
    ';
  end if;
end
$$;

commit;

