-- supabase/account_activation_enforcement.sql
-- *** PROPOSED — NOT APPLIED ANYWHERE BUT ISOLATED LOCAL TESTS. DO NOT RUN ON A HOSTED PROJECT WITHOUT SEPARATE APPROVAL. ***
--
-- The DATABASE half of Active-only enforcement for the Pending / Active / Ineligible lifecycle (project_specs.md,
-- "Pending accounts, onboarding activation & 13+ eligibility"; Phase 5). The SERVER half is middleware.ts +
-- lib/account/accessGate.ts, switched on separately with MAROON_ACCOUNT_ENFORCEMENT=on. This file CHANGES LIVE
-- BEHAVIOUR, which is why it is kept apart from the inert foundation (supabase/account_activation.sql). Tested by
-- lib/account/accountActivationDatabase.test.ts and scripts/auth-local/enforcement-regression.mts.
--
-- Audit (2026-10-29, local copy of the full schema): no public table has a permissive INSERT / UPDATE / DELETE policy,
-- and no table writable by `authenticated` has RLS off — browsers already can't write golf records directly; every write
-- goes through server-side security-definer functions. So the database's job here is (a) to refuse golf rows that attach
-- a non-participating profile, whoever writes them, and (b) to refuse Ineligible tokens at the REST layer.
--
-- What it changes when it is eventually run:
--   1. Ineligible / under-review accounts see and change NO row: account_is_active() (the restrictive
--      active_account_only policy on every RLS table + storage) now also refuses them. Their tokens can still be
--      verified (not blocked in the pre-request hook), so account deletion and birthday correction keep working; those
--      run through the server with the service role.
--   2. Golf rows can only attach a profile that may take part (profile_can_participate: activated, not closed, not
--      Ineligible / under review): scoring groups, saved and shared rounds, trip memberships, code-tournament players.
--      Pending accounts can't join, score or save rounds — trip invitations are HELD until Finish. Deliberately NOT the
--      full "Active" (which also needs a birthday): an organizer must still be able to put an activated legacy member
--      who hasn't logged in to add a birthday yet into a scoring group. The person ACTING is required to be fully Active
--      by the server gate.
--   3. Discovery shows ACTIVE profiles only (birthday included): search_golfers, profile_id_for_username (public
--      /profile/<username>) and get_profile_history (someone else's profile).
--   4. Organizer hand-offs (account deletion's trip transfer) can only be OFFERED to a participating profile, and offers
--      TO an account are withdrawn the moment it becomes Ineligible / under review.
--   5. backfill_legacy_activation(): activates ONLY profiles legacy_activation_classify() puts in eligible_completed,
--      and only when called with the explicit confirmation word. Nothing calls it.
--
-- Prerequisites: account_activation.sql (+ its prerequisites), profile_friends.sql, profile_read_model.sql.
-- Safe to run more than once.

-- === 1. Ineligible = blocked like a closed account =======================================================================
create or replace function public.account_is_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null or (
    not exists (select 1 from account_deletions where account_id = auth.uid())
    and not exists (select 1 from account_eligibility where account_id = auth.uid())
    and not session_is_revoked());
$$;

-- The PostgREST pre-request hook (reject_deleted_accounts, account_deletion.sql) is deliberately NOT extended to
-- Ineligible accounts: the server verifies an app token by calling session_is_revoked() WITH that token
-- (lib/supabase/requestIdentity.ts), so blocking there would make an Ineligible account unrecognisable — unable to ask
-- for a birthday correction or delete itself (found 2026-10-29). The row-level block above (account_is_active, ANDed into
-- every RLS table and storage) already hides every row from it; deleted accounts and revoked sessions stay refused by
-- the hook exactly as before. Re-declared here with account_deletion.sql's body so re-running this file also repairs a
-- database where an earlier draft had extended it.
create or replace function public.reject_deleted_accounts()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from account_deletions where account_id = auth.uid()) then
    raise exception 'This account has been deleted.' using errcode = '42501';
  end if;
  if session_is_revoked() then
    raise exception 'This session has been signed out. Sign in again.' using errcode = '42501';
  end if;
end;
$$;

-- === 2. Golf rows only attach profiles that may take part =================================================================
-- Activated, not closed, not Ineligible / under review. (profile_is_active additionally needs a birthday on file.)
create or replace function public.profile_can_participate(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = p_profile and p.activated_at is not null and p.deleted_at is null)
     and not exists (select 1 from account_deletions d where d.account_id = p_profile)
     and not exists (select 1 from account_eligibility e where e.account_id = p_profile);
$$;

create or replace function public.require_complete_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id)
     and not profile_can_participate(new.profile_id) then
    raise exception 'Finish setting up your profile first.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['scoring_group_players', 'player_rounds', 'shared_round_players', 'golf_trip_members', 'code_tournament_players'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists require_complete_profile on public.%I', t);
      execute format('create trigger require_complete_profile before insert or update of profile_id on public.%I
        for each row execute function public.require_complete_profile()', t);
    end if;
  end loop;
end $$;

-- === 3. Discovery: Active profiles only ===================================================================================
create or replace function public.profile_id_for_username(p_username text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where lower(username) = lower(trim(p_username)) and profile_is_active(id);
$$;

-- search_golfers / get_profile_history: the originals are kept (renamed *_all) and wrapped, so their logic is not copied.
-- Each wrapper is only created where the feature exists (profile_friends.sql / profile_read_model.sql): a database
-- without one of them must still accept this file (found 2026-10-29 on a local stack without profile_friends.sql).
do $$
begin
  if to_regprocedure('public.search_golfers_all(uuid, text)') is null and to_regprocedure('public.search_golfers(uuid, text)') is not null then
    alter function public.search_golfers(uuid, text) rename to search_golfers_all;
  end if;
  if to_regprocedure('public.search_golfers_all(uuid, text)') is not null then
    execute $f$
      create or replace function public.search_golfers(p_viewer uuid, p_query text)
      returns jsonb
      language sql stable security definer set search_path = public as $b$
        select coalesce(jsonb_agg(g order by ord), '[]'::jsonb)
        from jsonb_array_elements(search_golfers_all(p_viewer, p_query)) with ordinality as x(g, ord)
        where profile_is_active((g->>'id')::uuid);
      $b$ $f$;
  end if;
  if to_regprocedure('public.get_profile_history_all(uuid, uuid)') is null and to_regprocedure('public.get_profile_history(uuid, uuid)') is not null then
    alter function public.get_profile_history(uuid, uuid) rename to get_profile_history_all;
  end if;
  if to_regprocedure('public.get_profile_history_all(uuid, uuid)') is not null then
    execute $f$
      create or replace function public.get_profile_history(p_viewer uuid, p_subject uuid)
      returns jsonb
      language sql stable security definer set search_path = public as $b$
        select case when p_viewer is distinct from p_subject and not profile_is_active(p_subject)
          then jsonb_build_object('restricted', true, 'trips', '[]'::jsonb, 'tournaments', '[]'::jsonb)
          else get_profile_history_all(p_viewer, p_subject) end;
      $b$ $f$;
  end if;
end $$;

-- === 4. Organizer hand-offs follow the lifecycle ==========================================================================
create or replace function public.require_participating_handoff_target()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not profile_can_participate(new.to_profile) then
    raise exception 'That member can''t take over this trip.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.golf_trip_organizer_handoffs') is not null then
    drop trigger if exists require_participating_handoff_target on public.golf_trip_organizer_handoffs;
    create trigger require_participating_handoff_target before insert or update of to_profile on public.golf_trip_organizer_handoffs
      for each row execute function public.require_participating_handoff_target();
  end if;
end $$;

-- When an account becomes Ineligible / under review, offers made TO it are withdrawn (it must never be handed a trip).
create or replace function public.withdraw_handoffs_to_restricted_account()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.golf_trip_organizer_handoffs') is not null then
    execute 'delete from public.golf_trip_organizer_handoffs where to_profile = $1' using new.account_id;
  end if;
  return new;
end;
$$;
revoke all on function public.require_participating_handoff_target() from public, anon, authenticated;
revoke all on function public.withdraw_handoffs_to_restricted_account() from public, anon, authenticated;
drop trigger if exists withdraw_handoffs_to_restricted_account on public.account_eligibility;
create trigger withdraw_handoffs_to_restricted_account after insert or update of status on public.account_eligibility
  for each row execute function public.withdraw_handoffs_to_restricted_account();

-- === 5. Legacy backfill (explicit, reviewed, never automatic) =============================================================
-- Activates ONLY eligible_completed profiles from the dry-run classification. Everything else is left exactly as it is.
-- Must be called with the confirmation word; returns counts only.
create or replace function public.backfill_legacy_activation(p_confirm text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_confirm is distinct from 'ACTIVATE-ELIGIBLE-LEGACY-PROFILES' then
    raise exception 'Backfill not confirmed.' using errcode = '42501';
  end if;
  perform set_config('maroon.activation', 'on', true);
  update profiles set activated_at = now()
  where activated_at is null and id in (select account_id from legacy_activation_classify() where category = 'eligible_completed');
  get diagnostics v_count = row_count;
  perform set_config('maroon.activation', 'off', true);
  return jsonb_build_object('activated', v_count, 'inventoryAfter', legacy_activation_inventory());
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.profile_id_for_username(text)', 'public.search_golfers(uuid, text)', 'public.get_profile_history(uuid, uuid)',
    'public.backfill_legacy_activation(text)', 'public.profile_can_participate(uuid)'] loop
    continue when to_regprocedure(f) is null;
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.search_golfers_all(uuid, text)', 'public.get_profile_history_all(uuid, uuid)'] loop
    if to_regprocedure(f) is not null then execute format('revoke all on function %s from public, anon, authenticated', f); end if;
  end loop;
end $$;
