-- supabase/account_activation_enforcement.sql
-- *** PROPOSED — NOT RUN IN PHASE 1. DO NOT RUN ON ANY HOSTED PROJECT WITHOUT SEPARATE APPROVAL (roadmap Phase 5). ***
--
-- The access rules for the Pending / Active / Ineligible lifecycle (project_specs.md, "Pending accounts, onboarding
-- activation & 13+ eligibility"). It CHANGES LIVE BEHAVIOUR, which is why it is kept apart from the inert foundation
-- (supabase/account_activation.sql). It is exercised only by the isolated database tests
-- (lib/account/accountActivationDatabase.test.ts) so it is proven before anyone approves it.
--
-- What it changes when it is eventually run:
--   1. Ineligible accounts are blocked EVERYWHERE the deletion block already reaches: account_is_active() (the
--      restrictive active_account_only policy on every RLS table + storage) and the PostgREST pre-request hook.
--   2. Golf writes need an ACTIVE profile: require_complete_profile() now checks profile_is_active(), and the trigger also
--      covers new/changed memberships (golf_trip_members, code_tournament_players). Pending accounts can't join, score
--      or save rounds. NOTE: today's "unfinished profiles may accept a trip invite" becomes "held until Finish".
--   3. Discovery shows ACTIVE profiles only: search_golfers, profile_id_for_username (public /profile/<username>) and
--      get_profile_history (someone else's profile) skip anyone who isn't Active.
--   4. backfill_legacy_activation(): activates ONLY profiles legacy_activation_classify() puts in eligible_completed,
--      and only when called with the explicit confirmation word. Nothing calls it.
-- NOT included yet (Phase 5 list): account-deletion hand-off checks (they still use profile_is_complete), the app's
-- server routes, and pages. Activated legacy accounts without a birthday are not Active until the Birthday step.
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

create or replace function public.reject_deleted_accounts()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from account_deletions where account_id = auth.uid()) then
    raise exception 'This account has been deleted.' using errcode = '42501';
  end if;
  if auth.uid() is not null and exists (select 1 from account_eligibility where account_id = auth.uid()) then
    raise exception 'This account can''t use The Maroon.' using errcode = '42501';
  end if;
  if session_is_revoked() then
    raise exception 'This session has been signed out. Sign in again.' using errcode = '42501';
  end if;
end;
$$;

-- === 2. Golf features need an ACTIVE profile ==============================================================================
create or replace function public.require_complete_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id)
     and not profile_is_active(new.profile_id) then
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
do $$
begin
  if to_regprocedure('public.search_golfers_all(uuid, text)') is null and to_regprocedure('public.search_golfers(uuid, text)') is not null then
    alter function public.search_golfers(uuid, text) rename to search_golfers_all;
  end if;
  if to_regprocedure('public.get_profile_history_all(uuid, uuid)') is null and to_regprocedure('public.get_profile_history(uuid, uuid)') is not null then
    alter function public.get_profile_history(uuid, uuid) rename to get_profile_history_all;
  end if;
end $$;

create or replace function public.search_golfers(p_viewer uuid, p_query text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(g order by ord), '[]'::jsonb)
  from jsonb_array_elements(search_golfers_all(p_viewer, p_query)) with ordinality as x(g, ord)
  where profile_is_active((g->>'id')::uuid);
$$;

create or replace function public.get_profile_history(p_viewer uuid, p_subject uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_viewer is distinct from p_subject and not profile_is_active(p_subject)
    then jsonb_build_object('restricted', true, 'trips', '[]'::jsonb, 'tournaments', '[]'::jsonb)
    else get_profile_history_all(p_viewer, p_subject) end;
$$;

-- === 4. Legacy backfill (explicit, reviewed, never automatic) =============================================================
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
    'public.backfill_legacy_activation(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.search_golfers_all(uuid, text)', 'public.get_profile_history_all(uuid, uuid)'] loop
    if to_regprocedure(f) is not null then execute format('revoke all on function %s from public, anon, authenticated', f); end if;
  end loop;
end $$;
