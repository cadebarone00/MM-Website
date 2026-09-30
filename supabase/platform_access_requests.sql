-- supabase/platform_access_requests.sql
-- Beta access requests for tournament creation (THE_MAROON_PRODUCT_SPEC.md
-- §17.2, invite-only beta). A request is only a record of interest: it never
-- grants anything. Creation is still decided solely by the existing
-- tournament_creator_access row (see create_tournament_shell); a platform
-- admin's explicit approval is what writes status 'approved' there.
--
-- Called only by server routes with the service role. Never touches live_*
-- (live scoring) tables.
--
-- Prerequisites: platform_foundation.sql. Safe to run more than once.
-- Undo: see docs/production-migration-checklist.md (ACCESS REQUESTS row).

begin;

create table if not exists public.tournament_access_requests (
  id uuid primary key default gen_random_uuid(),
  -- Short, non-secret reference shown to admins instead of the row id.
  reference bigint generated always as identity unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Snapshot of the account email at request time (for the reviewer to reply).
  email text not null check (length(email) between 3 and 320),
  requester_name text not null check (length(trim(requester_name)) between 1 and 80),
  group_name text not null check (length(trim(group_name)) between 1 and 80),
  season_year integer not null check (season_year between 2000 and 2200),
  expected_players integer not null check (expected_players between 2 and 500),
  destination text check (destination is null or length(destination) <= 120),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  -- Shown to the requester on their status page.
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (reviewed_at is null))
);
-- At most one pending request per person.
create unique index if not exists tournament_access_requests_one_pending
  on public.tournament_access_requests (profile_id) where status = 'pending';
create index if not exists tournament_access_requests_status_idx
  on public.tournament_access_requests (status, created_at);

alter table public.tournament_access_requests enable row level security;
revoke all on public.tournament_access_requests from public, anon, authenticated;

-- The same rule create_tournament_shell enforces (and
-- lib/platform/entitlements.ts canCreateTournament mirrors).
create or replace function public.can_create_tournament(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((select platform_role = 'admin' from profiles where id = p_profile), false)
      or (exists (select 1 from profiles where id = p_profile)
          and coalesce((select status from tournament_creator_access where profile_id = p_profile), 'none') <> 'revoked'
          and (coalesce((select tournament_creation from platform_settings where id), 'invite_only') = 'self_serve'
               or coalesce((select status from tournament_creator_access where profile_id = p_profile), 'none') = 'approved'));
$fn$;

-- What the requester may see about themselves: can they create, and their
-- latest request (no ids, no reviewer identity).
create or replace function public.get_my_tournament_access(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'canCreate', can_create_tournament(p_profile),
    'request', (select jsonb_build_object('status', r.status, 'requesterName', r.requester_name, 'groupName', r.group_name,
        'seasonYear', r.season_year, 'expectedPlayers', r.expected_players, 'destination', r.destination, 'note', r.note,
        'decisionNote', r.decision_note, 'createdAt', r.created_at, 'reviewedAt', r.reviewed_at)
      from tournament_access_requests r where r.profile_id = p_profile order by r.created_at desc limit 1));
$fn$;

-- Submit a request. Refused when the person can already create, already has a
-- pending request (that one is returned unchanged), or was denied (they are
-- pointed to support instead of re-requesting). Email is taken from the
-- profile, never from the caller.
create or replace function public.submit_tournament_access_request(p_profile uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_email text;
  v_latest text;
begin
  select email into v_email from profiles where id = p_profile;
  if v_email is null then
    raise exception 'No account found.' using errcode = '42501';
  end if;
  if can_create_tournament(p_profile) then
    raise exception 'You can already create tournaments.' using errcode = 'P0001', hint = 'already_approved';
  end if;
  select status into v_latest from tournament_access_requests where profile_id = p_profile order by created_at desc limit 1;
  if v_latest = 'pending' then
    return jsonb_build_object('duplicate', true, 'access', get_my_tournament_access(p_profile));
  end if;
  if v_latest = 'denied' then
    raise exception 'Your earlier request was not approved. Contact us to talk about it.' using errcode = 'P0001', hint = 'denied';
  end if;
  insert into tournament_access_requests (profile_id, email, requester_name, group_name, season_year, expected_players, destination, note)
  values (p_profile, v_email, trim(p_input->>'requesterName'), trim(p_input->>'groupName'), (p_input->>'seasonYear')::integer,
    (p_input->>'expectedPlayers')::integer, nullif(trim(coalesce(p_input->>'destination', '')), ''), nullif(trim(coalesce(p_input->>'note', '')), ''));
  return jsonb_build_object('duplicate', false, 'access', get_my_tournament_access(p_profile));
exception when unique_violation then
  -- Two submits at once: the one-pending index kept a single request.
  return jsonb_build_object('duplicate', true, 'access', get_my_tournament_access(p_profile));
end;
$fn$;

-- Platform admins only: requests for review, newest first within status.
create or replace function public.list_tournament_access_requests(p_admin uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not coalesce((select platform_role = 'admin' from profiles where id = p_admin), false) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('reference', r.reference, 'status', r.status, 'requesterName', r.requester_name,
      'email', r.email, 'groupName', r.group_name, 'seasonYear', r.season_year, 'expectedPlayers', r.expected_players,
      'destination', r.destination, 'note', r.note, 'decisionNote', r.decision_note, 'createdAt', r.created_at,
      'reviewedAt', r.reviewed_at, 'reviewedBy', (select coalesce(p.display_name, p.username) from profiles p where p.id = r.reviewed_by))
    order by (r.status = 'pending') desc, r.created_at desc)
    from tournament_access_requests r), '[]'::jsonb);
end;
$fn$;

-- Platform admins only: approve or deny one pending request. Approval is the
-- ONLY path here that grants creation, by writing the existing
-- tournament_creator_access row. Denial leaves creator access untouched.
create or replace function public.review_tournament_access_request(p_admin uuid, p_reference bigint, p_decision text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_request tournament_access_requests;
begin
  if not coalesce((select platform_role = 'admin' from profiles where id = p_admin), false) then
    raise exception 'Not found.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'denied') then
    raise exception 'Choose approve or deny.' using errcode = '22023';
  end if;
  select * into v_request from tournament_access_requests where reference = p_reference for update;
  if v_request.id is null then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request was already reviewed.' using errcode = 'P0001', hint = 'already_reviewed';
  end if;
  update tournament_access_requests
    set status = p_decision, decision_note = nullif(trim(coalesce(p_note, '')), ''), reviewed_by = p_admin, reviewed_at = now()
    where id = v_request.id;
  if p_decision = 'approved' then
    insert into tournament_creator_access (profile_id, status, note, decided_by, decided_at)
    values (v_request.profile_id, 'approved', left('Approved access request #' || p_reference, 500), p_admin, now())
    on conflict (profile_id) do update set status = 'approved', note = excluded.note, decided_by = excluded.decided_by, decided_at = excluded.decided_at;
  end if;
  return list_tournament_access_requests(p_admin);
end;
$fn$;

revoke all on function public.can_create_tournament(uuid) from public, anon, authenticated;
revoke all on function public.get_my_tournament_access(uuid) from public, anon, authenticated;
revoke all on function public.submit_tournament_access_request(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.list_tournament_access_requests(uuid) from public, anon, authenticated;
revoke all on function public.review_tournament_access_request(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.can_create_tournament(uuid) to service_role;
grant execute on function public.get_my_tournament_access(uuid) to service_role;
grant execute on function public.submit_tournament_access_request(uuid, jsonb) to service_role;
grant execute on function public.list_tournament_access_requests(uuid) to service_role;
grant execute on function public.review_tournament_access_request(uuid, bigint, text, text) to service_role;
grant select, insert, update on public.tournament_access_requests to service_role;

commit;
