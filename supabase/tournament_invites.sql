-- supabase/tournament_invites.sql
-- Email invites for tournaments by code: after creating a tournament the organizer drops in a file of players (name,
-- email, and a handicap for net). Each gets an invite, emailed with the tournament code and a link
-- (/tournaments/code/invite/<secret>). Opening the link: signed in → they join straight away (with the handicap from
-- the file); signed out → create a profile (or log in) and come back to the link, which then joins them.
--
-- The link carries a random secret; only its SHA-256 hash is stored. The email is contact info only (never identity):
-- whoever opens the link and signs in is the one who joins. The server makes the secrets and sends the emails with the
-- service-role key (lib/platform/tournamentInvites.ts).
--
-- Prerequisites: tournament_codes.sql (and the later tournament_*.sql files). Safe to run more than once.
-- Undo: drop table public.code_tournament_invites; drop function public.add_code_tournament_invites(uuid, uuid, jsonb),
--       public.mark_code_tournament_invites_sent(uuid, uuid[]), public.get_code_tournament_invite(text),
--       public.accept_code_tournament_invite(uuid, text, numeric);

begin;

create table if not exists public.code_tournament_invites (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.code_tournaments(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  email text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 254),
  handicap numeric check (handicap is null or handicap between -10 and 54),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  unique (tournament_id, email)
);
alter table public.code_tournament_invites enable row level security;
revoke all on public.code_tournament_invites from public, anon, authenticated;

create or replace function public.code_tournament_invite_hash(p_token text)
returns text language sql immutable set search_path = public as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- The organizer adds invites ([{ name, email, handicap, token }]; up to 500). The same email again replaces that
-- invite (new name / handicap / link). Returns [{ id, name, email, token }] for the emails.
create or replace function public.add_code_tournament_invites(p_organizer uuid, p_tournament uuid, p_invites jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_out jsonb := '[]'::jsonb; v_id uuid; v_email text;
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can invite players.' using errcode = '42501'; end if;
  if not exists (select 1 from code_tournaments where id = p_tournament and status = 'live') then raise exception 'This tournament has ended.' using errcode = '22023'; end if;
  if jsonb_typeof(p_invites) <> 'array' or jsonb_array_length(p_invites) not between 1 and 500 then raise exception 'Add 1 to 500 players.' using errcode = '22023'; end if;
  for v_row in select value from jsonb_array_elements(p_invites) loop
    v_email := lower(btrim(v_row ->> 'email'));
    insert into code_tournament_invites (tournament_id, name, email, handicap, token_hash)
    values (p_tournament, btrim(v_row ->> 'name'), v_email, (v_row ->> 'handicap')::numeric, code_tournament_invite_hash(v_row ->> 'token'))
    on conflict (tournament_id, email) do update set name = excluded.name, handicap = excluded.handicap, token_hash = excluded.token_hash, sent_at = null
    returning id into v_id;
    v_out := v_out || jsonb_build_object('id', v_id, 'name', btrim(v_row ->> 'name'), 'email', v_email, 'token', v_row ->> 'token');
  end loop;
  return v_out;
end $$;

create or replace function public.mark_code_tournament_invites_sent(p_tournament uuid, p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update code_tournament_invites set sent_at = now() where tournament_id = p_tournament and id = any(p_ids);
$$;

-- What an invite link shows (signed in or not): the tournament, who was invited, and the handicap from the file. The
-- email is never shown. Null for an unknown link.
create or replace function public.get_code_tournament_invite(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tournamentId', t.id, 'tournamentName', t.name, 'scoring', t.scoring, 'status', t.status,
    'invitedName', i.name, 'handicap', i.handicap, 'organizerName', pr.display_name, 'accepted', i.accepted_by is not null)
  from code_tournament_invites i join code_tournaments t on t.id = i.tournament_id left join profiles pr on pr.id = t.organizer
  where i.token_hash = code_tournament_invite_hash(p_token);
$$;

-- The signed-in person opening the link joins (the file's handicap wins; `p_handicap` is theirs when the file had none).
-- Safe to repeat. Returns the tournament id.
create or replace function public.accept_code_tournament_invite(p_profile uuid, p_token text, p_handicap numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_invite code_tournament_invites%rowtype; v_code text; v_id uuid;
begin
  select * into v_invite from code_tournament_invites where token_hash = code_tournament_invite_hash(p_token);
  if v_invite.id is null then raise exception 'This invite link isn''t valid.' using errcode = '22023'; end if;
  select code into v_code from code_tournaments where id = v_invite.tournament_id;
  v_id := join_code_tournament(p_profile, v_code, coalesce(v_invite.handicap, p_handicap));
  update code_tournament_invites set accepted_by = coalesce(accepted_by, p_profile), accepted_at = coalesce(accepted_at, now()) where id = v_invite.id;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['code_tournament_invite_hash(text)', 'add_code_tournament_invites(uuid, uuid, jsonb)',
    'mark_code_tournament_invites_sent(uuid, uuid[])', 'get_code_tournament_invite(text)', 'accept_code_tournament_invite(uuid, text, numeric)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
