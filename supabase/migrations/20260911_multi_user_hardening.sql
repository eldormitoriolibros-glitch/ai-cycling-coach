-- Multi-user hardening: close the two gaps that let one athlete reach another's
-- data. Run this before giving anyone else an account.
begin;

-- -----------------------------------------------------------------------------
-- power_curve_snapshots shipped without row level security, so every
-- authenticated user could read and write everybody's curves.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.power_curve_snapshots') is not null then
    execute 'alter table public.power_curve_snapshots enable row level security';
    execute 'drop policy if exists "power_curve_snapshots_own" on public.power_curve_snapshots';
    execute $p$
      create policy "power_curve_snapshots_own" on public.power_curve_snapshots
        for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $p$;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- users: an RLS policy cannot restrict columns, so the Telegram link fields are
-- taken away from the browser with column-level grants instead. Only the
-- service role writes them, from the link route and the bot webhook; without
-- this a user can claim somebody else's chat id.
-- -----------------------------------------------------------------------------
revoke update on public.users from authenticated;

grant update (
  name,
  username,
  age,
  sex,
  weight_kg,
  height_cm,
  experience_level,
  cycling_goals,
  timezone,
  locale
) on public.users to authenticated;

grant update on public.users to service_role;

commit;
