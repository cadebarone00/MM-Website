-- supabase/golf_trip_scoring_fix_groups.sql
-- Fix for golf_trip_scoring.sql (already applied): save_trip_scoring_groups refused EVERY group with "Every player must
-- be on this trip." Its membership check named the unnested profile id "id", which golf_trip_members' own id column
-- shadowed, so a member's profile id was compared with the member row's id and never matched. Found by running the SQL
-- on a real Postgres engine (lib/platform/tripScoringDatabase.test.ts). This file only replaces that one function with
-- the corrected version from golf_trip_scoring.sql; no tables or data change.
--
-- Run after golf_trip_scoring.sql. Safe to run more than once.

begin;

create or replace function public.save_trip_scoring_groups(p_profile uuid, p_trip uuid, p_round_number integer, p_groups jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round golf_trip_rounds;
  v_group jsonb;
  v_player jsonb;
  v_group_id uuid;
  v_number integer := 0;
  v_order integer;
  v_all uuid[] := '{}';
  v_ids uuid[];
  v_attesters uuid[];
begin
  if golf_trip_member_id(p_profile, p_trip) is null then raise exception 'Trip not found.' using errcode = 'P0002'; end if;
  -- Serialize: two phones opening scoring at once save the groups once.
  select * into v_round from golf_trip_rounds where golf_trip_id = p_trip and round_number = p_round_number for update;
  if v_round.id is null then raise exception 'Round not found.' using errcode = 'P0002'; end if;

  if exists (select 1 from scoring_groups where golf_trip_round_id = v_round.id and assignments_locked_at is not null) then
    return get_trip_round_scoring(p_profile, p_trip, p_round_number);
  end if;

  if jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'A round needs at least one group.' using errcode = '22023';
  end if;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(v_group->'players') <> 'array' or jsonb_array_length(v_group->'players') < 2 then
      raise exception 'Every trip group needs at least 2 players.' using errcode = '22023';
    end if;
    select array_agg((p->>'profileId')::uuid), array_agg((p->>'attesterProfileId')::uuid)
      into v_ids, v_attesters from jsonb_array_elements(v_group->'players') p;
    -- u(pid), not "id": golf_trip_members has its own id column, which would shadow it.
    if exists (select 1 from unnest(v_ids) u(pid) where not exists (
        select 1 from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = u.pid and m.invitation_status = 'accepted')) then
      raise exception 'Every player must be on this trip.' using errcode = '22023';
    end if;
    if (v_all && v_ids) or (select count(distinct id) from unnest(v_ids) id) <> array_length(v_ids, 1) then
      raise exception 'A player can only be in one group.' using errcode = '22023';
    end if;
    v_all := v_all || v_ids;
    -- Everyone attests exactly one other player in the group and is attested by exactly one.
    if exists (select 1 from unnest(v_attesters) a where a is null or not (a = any(v_ids)))
       or exists (select 1 from jsonb_array_elements(v_group->'players') p where p->>'attesterProfileId' = p->>'profileId')
       or (select count(distinct a) from unnest(v_attesters) a) <> array_length(v_ids, 1) then
      raise exception 'Every player attests exactly one other player in their group.' using errcode = '22023';
    end if;
  end loop;

  -- Nothing to do when the saved groups already match.
  if (select coalesce(jsonb_agg(players order by group_number), '[]'::jsonb) from (
        select g.group_number, jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'attesterProfileId', p.attester_profile_id, 'side', p.side) order by p.play_order) players
        from scoring_groups g join scoring_group_players p on p.group_id = g.id where g.golf_trip_round_id = v_round.id group by g.group_number) s)
     = (select jsonb_agg(g.value->'players' order by g.n) from jsonb_array_elements(p_groups) with ordinality g(value, n)) then
    return get_trip_round_scoring(p_profile, p_trip, p_round_number);
  end if;

  delete from scoring_groups where golf_trip_round_id = v_round.id;
  for v_group in select g.value from jsonb_array_elements(p_groups) with ordinality g(value, n) order by g.n loop
    v_number := v_number + 1;
    insert into scoring_groups (source, golf_trip_id, golf_trip_round_id, group_number, created_by)
    values ('trip', p_trip, v_round.id, v_number, p_profile) returning id into v_group_id;
    v_order := 0;
    for v_player in select p.value from jsonb_array_elements(v_group->'players') with ordinality p(value, n) order by p.n loop
      v_order := v_order + 1;
      insert into scoring_group_players (group_id, profile_id, play_order, side, attester_profile_id)
      values (v_group_id, (v_player->>'profileId')::uuid, v_order, nullif(v_player->>'side', ''), (v_player->>'attesterProfileId')::uuid);
    end loop;
  end loop;
  return get_trip_round_scoring(p_profile, p_trip, p_round_number);
end;
$$;

revoke all on function public.save_trip_scoring_groups(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_trip_scoring_groups(uuid, uuid, integer, jsonb) to service_role;

commit;
