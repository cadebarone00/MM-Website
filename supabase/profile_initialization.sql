-- supabase/profile_initialization.sql
-- Accounts V2 (project_specs.md "Accounts Step 2"): one profile per verified account, created idempotently, separate
-- from authentication. Replaces the V1 pattern where signup / admin invite inserted the profile in a second step and
-- deleted the account when that failed (reproduced in docs/auth-local-reproduction-2026-10-16.md, S3 / S9 / S10).
--
--   initialize_my_profile(account)       verified accounts only; creates the profile row if missing (safe to repeat,
--                                        safe concurrently), finishes an admin player-claim invitation for this
--                                        exact account, returns the profile state. Never touches an existing
--                                        profile's name, username or legacy link.
--   complete_my_profile(profile, input)  sets display name + username while the profile is incomplete.
--   create_player_claim_invitation(...)  an admin binds an old Maroon player slot to ONE invited account id. The claim
--                                        only completes when that account verifies its email and initializes.
--   profile_is_complete(profile)         username and display name both set.
--   require_complete_profile trigger     scoring groups, saved rounds and shared rounds need a complete profile.
--
-- Incomplete profiles: username and display_name become nullable (audit: docs/accounts-v2-architecture-2026-10-17.md).
-- Every V1 profile already has both, so nothing changes for them. No row is rewritten or deleted by this file.
-- All functions: security definer, pinned search_path, callable by service_role only (the server passes the account id
-- from the verified session, never from a request body).
--
-- Prerequisites: schema.sql, player_slots_full_name.sql, profile_identity.sql, profile_v1.sql. Optional tables
-- (player_rounds, shared_round_players, scoring_group_players) get the trigger only if they exist.
-- Safe to run more than once.
-- Undo: drop the 4 functions, the trigger function and its triggers, and player_claim_invitations; then (only if no
-- incomplete profiles exist) alter column username / display_name set not null.

begin;

-- === Incomplete profiles =============================================================================================
alter table public.profiles alter column username drop not null;
alter table public.profiles alter column display_name drop not null;
comment on column public.profiles.username is 'Public handle. NULL while the profile is incomplete (setup not finished); never invented.';
comment on column public.profiles.display_name is 'Real name. NULL while the profile is incomplete, unless prefilled from an admin player invitation.';

create or replace function public.profile_is_complete(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_profile
    and coalesce(trim(username), '') <> '' and coalesce(trim(display_name), '') <> '');
$$;

-- === Admin player-claim invitations ==================================================================================
-- One pending invitation per old player slot, bound to the auth account the admin's invite created or re-sent to.
-- Knowing a player code proves nothing; only verifying the invited account's email completes the claim.
create table if not exists public.player_claim_invitations (
  player_slug text primary key references public.player_slots(player_slug) on delete cascade,
  account_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references public.profiles(id) on delete set null,
  -- The player's real name as the admin knows it; prefills the display name when the claim completes.
  display_name text check (display_name is null or length(trim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.player_claim_invitations add column if not exists display_name text;
create index if not exists player_claim_invitations_account_idx on public.player_claim_invitations (account_id);
alter table public.player_claim_invitations enable row level security;
revoke all on public.player_claim_invitations from public, anon, authenticated;

-- An earlier draft took 3 arguments; drop it so no second version stays callable.
drop function if exists public.create_player_claim_invitation(uuid, text, uuid);
create or replace function public.create_player_claim_invitation(p_host uuid, p_player_slug text, p_account uuid, p_display_name text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_slot public.player_slots;
begin
  if not coalesce((select is_host from profiles where id = p_host), false) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_account) then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  select * into v_slot from player_slots where player_slug = p_player_slug for update;
  if v_slot.player_slug is null then raise exception 'Unknown player.' using errcode = '22023'; end if;
  if v_slot.claimed_by is not null then raise exception 'Already claimed.' using errcode = '22023'; end if;
  if exists (select 1 from profiles where id = p_account and player_slug is not null) then
    raise exception 'That account is already linked to a player.' using errcode = '22023';
  end if;
  insert into player_claim_invitations (player_slug, account_id, invited_by, display_name)
  values (p_player_slug, p_account, p_host, nullif(left(trim(coalesce(p_display_name, '')), 60), ''))
  on conflict (player_slug) do update set account_id = excluded.account_id, invited_by = excluded.invited_by,
    display_name = excluded.display_name, created_at = now();
  return jsonb_build_object('playerSlug', p_player_slug, 'pending', true);
end;
$$;

-- === Initialization (idempotent, verified accounts only) =============================================================
create or replace function public.initialize_my_profile(p_account uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user record;
  v_created boolean := false;
  v_invite public.player_claim_invitations;
  v_claimed text;
  v_full_name text;
begin
  select id, email, confirmed_at into v_user from auth.users where id = p_account;
  if v_user.id is null then raise exception 'No account found.' using errcode = '42501'; end if;
  if v_user.confirmed_at is null then raise exception 'Verify your email first.' using errcode = '42501'; end if;

  insert into profiles (id, email) values (p_account, coalesce(v_user.email, ''))
  on conflict (id) do nothing;
  v_created := found;

  -- An admin invitation bound to THIS account finishes now that the account is verified.
  select * into v_invite from player_claim_invitations where account_id = p_account order by created_at limit 1 for update;
  if v_invite.player_slug is not null then
    if exists (select 1 from profiles where id = p_account and player_slug is null)
       and not exists (select 1 from profiles where player_slug = v_invite.player_slug) then
      update player_slots set claimed_by = p_account, claimed_at = now()
      where player_slug = v_invite.player_slug and claimed_by is null
      returning player_slug, full_name into v_claimed, v_full_name;
      if v_claimed is not null then
        update profiles set player_slug = v_claimed,
          display_name = coalesce(display_name, v_invite.display_name, nullif(trim(v_full_name), ''))
        where id = p_account;
      end if;
    end if;
    delete from player_claim_invitations where player_slug = v_invite.player_slug;
  end if;

  return jsonb_build_object('created', v_created, 'complete', profile_is_complete(p_account), 'claimedPlayer', v_claimed);
end;
$$;

-- === Finish setup =====================================================================================================
create or replace function public.complete_my_profile(p_profile uuid, p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.profiles;
  v_name text := trim(p_input->>'displayName');
  v_username text := trim(p_input->>'username');
  v_problem text;
begin
  select * into v_row from profiles where id = p_profile for update;
  if v_row.id is null then raise exception 'Set up your profile first.' using errcode = '42501'; end if;
  if profile_is_complete(p_profile) then
    return jsonb_build_object('complete', true, 'changed', false, 'username', v_row.username, 'displayName', v_row.display_name);
  end if;
  v_problem := coalesce(profile_display_name_problem(v_name), profile_username_problem(v_username, p_profile));
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  begin
    update profiles set display_name = v_name, username = v_username where id = p_profile;
  exception when unique_violation then
    raise exception 'That username is taken.' using errcode = '22023';
  end;
  return jsonb_build_object('complete', true, 'changed', true, 'username', v_username, 'displayName', v_name);
end;
$$;

-- === Scoring and rounds need a finished profile =======================================================================
create or replace function public.require_complete_profile()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and not profile_is_complete(new.profile_id) then
    raise exception 'Finish setting up your profile first.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['scoring_group_players', 'player_rounds', 'shared_round_players'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists require_complete_profile on public.%I', t);
      execute format('create trigger require_complete_profile before insert or update of profile_id on public.%I
        for each row execute function public.require_complete_profile()', t);
    end if;
  end loop;
end $$;

revoke all on function public.profile_is_complete(uuid) from public, anon, authenticated;
revoke all on function public.create_player_claim_invitation(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.initialize_my_profile(uuid) from public, anon, authenticated;
revoke all on function public.complete_my_profile(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.require_complete_profile() from public, anon, authenticated;
grant execute on function public.profile_is_complete(uuid) to service_role;
grant execute on function public.create_player_claim_invitation(uuid, text, uuid, text) to service_role;
grant execute on function public.initialize_my_profile(uuid) to service_role;
grant execute on function public.complete_my_profile(uuid, jsonb) to service_role;

commit;
