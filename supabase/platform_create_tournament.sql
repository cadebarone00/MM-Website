-- supabase/platform_create_tournament.sql
-- CREATE → EXIST (THE_MAROON_PRODUCT_SPEC.md §5.1): one all-or-nothing call
-- that turns the wizard's minimal input into a real Tournament + first
-- Edition. Called only by the server route POST /api/platform/tournaments
-- (service role), after it has validated the input with
-- lib/platform/tournamentCreate.ts.
--
-- Prerequisite: platform_foundation.sql. Independent of platform_editions.sql.
-- Safe to run more than once. Undo: drop function public.create_tournament_shell(uuid, jsonb);

begin;

create or replace function public.create_tournament_shell(p_profile uuid, p_input jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_mode text;
  v_access text;
  v_org uuid;
  v_tournament uuid;
  v_edition uuid;
  v_team jsonb;
  v_index integer := 0;
begin
  select * into v_profile from profiles where id = p_profile;
  if v_profile.id is null then
    raise exception 'No account found.' using errcode = '42501';
  end if;

  -- Who may create (spec §17.2). Same rule as lib/platform/entitlements.ts
  -- canCreateTournament; enforced here too so no caller can skip it.
  select tournament_creation into v_mode from platform_settings where id;
  select status into v_access from tournament_creator_access where profile_id = p_profile;
  -- coalesce everything: a missing row or role must mean "no", never SQL's
  -- unknown (which would slip past the `if not (...)` check).
  v_access := coalesce(v_access, 'none');
  if not (
    coalesce(v_profile.platform_role, '') = 'admin'
    or (v_access <> 'revoked' and (coalesce(v_mode, 'invite_only') = 'self_serve' or v_access = 'approved'))
  ) then
    raise exception 'Tournament creation is invite-only right now.' using errcode = '42501';
  end if;

  -- One organization per creator for now (billing home, beta plan).
  select id into v_org from organizations where created_by = p_profile order by created_at limit 1;
  if v_org is null then
    insert into organizations (slug, name, plan_key, created_by)
    values ('org-' || replace(p_profile::text, '-', ''),coalesce(nullif(trim(v_profile.display_name), ''), 'Organizer'), 'beta', p_profile)
    returning id into v_org;
  end if;

  begin
    insert into tournaments (organization_id, slug, name, short_name, visibility, status, branding, created_by)
    values (
      v_org, p_input->>'slug', p_input->>'name', p_input->>'shortName',
      coalesce(p_input->>'visibility', 'private'), 'draft',
      coalesce(nullif(p_input->'branding', 'null'::jsonb), '{}'::jsonb), p_profile
    )
    returning id into v_tournament;
  exception when unique_violation then
    raise exception 'That web address is already taken.' using errcode = '23505';
  end;

  insert into tournament_editions (tournament_id, season_year, label, start_date, end_date, timezone, status)
  values (
    v_tournament, (p_input->>'seasonYear')::integer, p_input->>'seasonYear',
    nullif(p_input->>'startDate', '')::date, nullif(p_input->>'endDate', '')::date,
    coalesce(nullif(p_input->>'timezone', ''), 'America/Chicago'), 'draft'
  )
  returning id into v_edition;

  insert into tournament_members (tournament_id, profile_id, role) values (v_tournament, p_profile, 'owner');

  for v_team in select * from jsonb_array_elements(coalesce(p_input->'teams', '[]'::jsonb)) loop
    insert into edition_teams (edition_id, key, name, color, sort_order)
    values (v_edition, v_team->>'key', v_team->>'name', v_team->>'color', v_index);
    v_index := v_index + 1;
  end loop;

  -- Planned rounds get their own rows (formats may be TBD); the rest of the
  -- plan (competition type, headcount) stays in edition_settings.plan.
  insert into edition_settings (edition_id, scoring, plan)
  values (v_edition, coalesce(p_input->'scoring', '{}'::jsonb), coalesce(p_input->'plan', '{}'::jsonb) - 'rounds');
  insert into edition_rounds (edition_id, round_number, format)
  select v_edition, round.ordinality, nullif(round.value->>'format', '')
  from jsonb_array_elements(coalesce(p_input->'plan'->'rounds', '[]'::jsonb)) with ordinality as round(value, ordinality);

  return jsonb_build_object('tournamentId', v_tournament, 'editionId', v_edition, 'tournamentSlug', p_input->>'slug', 'seasonYear', (p_input->>'seasonYear')::integer);
end;
$$;

revoke all on function public.create_tournament_shell(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_tournament_shell(uuid, jsonb) to service_role;

commit;
