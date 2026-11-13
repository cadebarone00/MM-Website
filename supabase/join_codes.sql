-- supabase/join_codes.sql
-- One way to join everything (project_specs.md, "Feature: One way to join everything"). Play rounds with friends and
-- Golf Trips get a 6-character invite code like Tourneys and Leagues already have (same letters: no 0 / O, 1 / I / L,
-- never starting with W, which watch codes use). Each tab's Join box takes its own codes. Whoever runs a round, trip,
-- tourney or league can email the code; every email sent is recorded here so the caps work.
--
--   - Play round: anyone with the code joins the live round (still up to 5 players), the same as accepting an invite.
--     The host's invite-by-name keeps working. Someone the host removed can't come back with the code.
--   - Golf Trip: anyone with the code is added straight in as a member (owner decision 2026-11-12), the same as the
--     30-minute join link (golf_trip_join_links.sql), which keeps working. The code doesn't expire; the organizer can
--     make a new one, and the old one stops working at once.
--   - Emails: only the host / organizer; at most 50 per round, trip, tourney or league, 200 a day per sender, and the
--     same address once an hour for the same thing. Records are kept 90 days.
--
-- Access: like the tables it touches — nobody reads or writes directly; the server calls these functions with the
-- signed-in person's profile id using the service-role key (lib/platform/joinCodesServer.ts).
--
-- Prerequisites: shared_rounds.sql, golf_trips.sql and golf_trip_invitations.sql. Emailing a tourney's or league's code
-- also needs tournament_codes.sql / leagues.sql (only when used). Safe to run more than once.
-- Undo: drop table public.email_invites_sent; drop trigger shared_rounds_invite_code on public.shared_rounds;
--       drop trigger golf_trips_invite_code on public.golf_trips;
--       alter table public.shared_rounds drop column invite_code; alter table public.golf_trips drop column invite_code;

begin;

-- A new code no row of p_table has yet in its invite_code column; try again on the rare clash.
create or replace function public.new_invite_code(p_table regclass)
returns text language plpgsql volatile set search_path = public as $$
declare
  v_code text;
  v_taken boolean;
  v_letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  loop
    v_code := substr(replace(v_letters, 'W', ''), 1 + floor(random() * (length(v_letters) - 1))::integer, 1)
      || (select string_agg(substr(v_letters, 1 + floor(random() * length(v_letters))::integer, 1), '') from generate_series(1, 5));
    execute format('select exists (select 1 from %s where invite_code = $1)', p_table) into v_taken using v_code;
    exit when not v_taken;
  end loop;
  return v_code;
end $$;

-- A code as typed ("k7q-4mz ") → as stored ("K7Q4MZ").
create or replace function public.clean_invite_code(p_code text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Every new round and trip gets its code as it's made (the functions that create them don't change).
create or replace function public.set_invite_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.invite_code is null then new.invite_code := new_invite_code(tg_table_name::regclass); end if;
  return new;
end $$;

alter table public.shared_rounds add column if not exists invite_code text;
alter table public.golf_trips add column if not exists invite_code text;
alter table public.shared_rounds drop constraint if exists shared_rounds_invite_code_format;
alter table public.shared_rounds add constraint shared_rounds_invite_code_format check (invite_code is null or invite_code ~ '^[A-HJKMNP-Z2-9]{6}$');
alter table public.golf_trips drop constraint if exists golf_trips_invite_code_format;
alter table public.golf_trips add constraint golf_trips_invite_code_format check (invite_code is null or invite_code ~ '^[A-HJKMNP-Z2-9]{6}$');
create unique index if not exists shared_rounds_invite_code_key on public.shared_rounds (invite_code) where invite_code is not null;
create unique index if not exists golf_trips_invite_code_key on public.golf_trips (invite_code) where invite_code is not null;
drop trigger if exists shared_rounds_invite_code on public.shared_rounds;
create trigger shared_rounds_invite_code before insert on public.shared_rounds for each row execute function public.set_invite_code();
drop trigger if exists golf_trips_invite_code on public.golf_trips;
create trigger golf_trips_invite_code before insert on public.golf_trips for each row execute function public.set_invite_code();

-- Rounds and trips made before this file get their codes now (one at a time, so each is unique).
do $$
declare v_id uuid;
begin
  for v_id in select id from shared_rounds where invite_code is null loop
    update shared_rounds set invite_code = new_invite_code('public.shared_rounds') where id = v_id;
  end loop;
  for v_id in select id from golf_trips where invite_code is null loop
    update golf_trips set invite_code = new_invite_code('public.golf_trips') where id = v_id;
  end loop;
end $$;

-- ── Play rounds ────────────────────────────────────────────────────────────────────────────────────────────────

-- The round's code, for anyone playing in it (to share). Null for anyone else.
create or replace function public.shared_round_invite_code(p_profile uuid, p_round uuid)
returns text language sql stable security definer set search_path = public as $$
  select r.invite_code from shared_rounds r
  where r.id = p_round and exists (select 1 from shared_round_players p where p.round_id = r.id and p.profile_id = p_profile and p.status = 'joined');
$$;

-- What a round's code shows before joining. Null = no round has that code.
create or replace function public.find_shared_round_by_code(p_profile uuid, p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('roundId', r.id, 'hostName', h.display_name, 'course', r.setup #>> '{course,name}', 'holes', r.setup ->> 'holes',
    'game', r.setup #>> '{game,id}', 'status', r.status, 'playerCount', shared_round_active_count(r.id),
    'member', exists (select 1 from shared_round_players p where p.round_id = r.id and p.profile_id = p_profile and p.status = 'joined'))
  from shared_rounds r join profiles h on h.id = r.host
  where r.invite_code = clean_invite_code(p_code);
$$;

-- Join a live round with its code (up to 5 players). An open invite is accepted; someone the host removed can't come
-- back. Returns the round's id.
create or replace function public.join_shared_round_by_code(p_profile uuid, p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_round shared_rounds; v_status text;
begin
  select * into v_round from shared_rounds where invite_code = clean_invite_code(p_code) for update;
  if v_round.id is null then raise exception 'No round has that code. Check it and try again.' using errcode = '22023'; end if;
  if v_round.status <> 'live' then raise exception 'This round has ended.' using errcode = '22023'; end if;
  select status into v_status from shared_round_players where round_id = v_round.id and profile_id = p_profile;
  if v_status = 'joined' then return v_round.id; end if;
  if v_status = 'removed' then raise exception 'The host removed you from this round.' using errcode = '42501'; end if;
  if v_status = 'invited' then
    update shared_round_players set status = 'joined', answered_at = now() where round_id = v_round.id and profile_id = p_profile;
    return v_round.id;
  end if;
  if shared_round_active_count(v_round.id) >= 5 then raise exception 'This round is full (5 players).' using errcode = '22023'; end if;
  insert into shared_round_players (round_id, profile_id, position, status, answered_at)
  values (v_round.id, p_profile, (select coalesce(max(position), 0) + 1 from shared_round_players where round_id = v_round.id), 'joined', now())
  on conflict (round_id, profile_id) do update set status = 'joined', answered_at = now(),
    position = (select coalesce(max(position), 0) + 1 from shared_round_players where round_id = v_round.id);
  return v_round.id;
end $$;

-- ── Golf Trips ─────────────────────────────────────────────────────────────────────────────────────────────────

-- The trip's code, for anyone on the trip (to share). Null for anyone else.
create or replace function public.golf_trip_invite_code(p_profile uuid, p_trip uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.invite_code from golf_trips t
  where t.id = p_trip and exists (select 1 from golf_trip_members m where m.golf_trip_id = t.id and m.profile_id = p_profile);
$$;

-- Organizer only: a new code; the old one stops working at once.
create or replace function public.reset_golf_trip_invite_code(p_profile uuid, p_trip uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not exists (select 1 from golf_trip_members where golf_trip_id = p_trip and profile_id = p_profile and role = 'organizer') then
    raise exception 'Only the organizer can make a new code.' using errcode = '42501';
  end if;
  v_code := new_invite_code('public.golf_trips');
  update golf_trips set invite_code = v_code where id = p_trip;
  return v_code;
end $$;

-- What a trip's code shows before joining (never any email). Null = no trip has that code.
create or replace function public.find_golf_trip_by_code(p_profile uuid, p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tripId', t.id, 'tripName', t.name, 'destination', t.destination, 'startDate', t.start_date, 'endDate', t.end_date,
    'organizerName', (select o.display_name from golf_trip_members o where o.golf_trip_id = t.id and o.role = 'organizer' limit 1),
    'member', exists (select 1 from golf_trip_members m where m.golf_trip_id = t.id and m.profile_id = p_profile))
  from golf_trips t
  where t.invite_code = clean_invite_code(p_code);
$$;

-- Join a trip with its code: added straight in, like the join link. Someone already invited by this email claims
-- that invitation instead of getting a second row. Returns the trip's id.
create or replace function public.join_golf_trip_by_invite_code(p_profile uuid, p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_trip uuid;
  v_invite uuid;
begin
  select * into v_profile from profiles where id = p_profile;
  if v_profile.id is null then raise exception 'Finish setting up your profile first.' using errcode = '42501'; end if;
  select id into v_trip from golf_trips where invite_code = clean_invite_code(p_code) for update;
  if v_trip is null then raise exception 'No trip has that code. Check it and try again.' using errcode = '22023'; end if;
  if exists (select 1 from golf_trip_members where golf_trip_id = v_trip and profile_id = p_profile) then return v_trip; end if;
  begin
    select id into v_invite from golf_trip_members
    where golf_trip_id = v_trip and profile_id is null and invitation_status = 'pending'
      and v_profile.email is not null and lower(email) = lower(v_profile.email)
    for update;
    if v_invite is not null then
      update golf_trip_members set profile_id = p_profile, invitation_status = 'accepted', claimed_at = now(), invite_token_hash = null where id = v_invite;
    else
      insert into golf_trip_members (golf_trip_id, profile_id, display_name, email, role, invitation_status, claimed_at)
      values (v_trip, p_profile, left(coalesce(nullif(trim(v_profile.display_name), ''), nullif(trim(v_profile.username), ''), 'Golfer'), 120),
        -- One email per trip: leave it off when another row (e.g. a declined invite) already has it.
        case when v_profile.email is not null and not exists (
          select 1 from golf_trip_members x where x.golf_trip_id = v_trip and lower(x.email) = lower(v_profile.email)) then v_profile.email end,
        'member', 'accepted', now());
    end if;
  exception when unique_violation then
    -- The same person joined at the same moment some other way.
    null;
  end;
  return v_trip;
end $$;

-- ── Emailing the code ──────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.email_invites_sent (
  id bigint generated always as identity primary key,
  sender uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('round', 'trip', 'tourney', 'league')),
  item uuid not null,
  email text not null check (length(email) between 3 and 254),
  sent_at timestamptz not null default now()
);
create index if not exists email_invites_sent_item on public.email_invites_sent (kind, item, sent_at);
create index if not exists email_invites_sent_sender on public.email_invites_sent (sender, sent_at);
alter table public.email_invites_sent enable row level security;
revoke all on public.email_invites_sent from anon, authenticated;

-- What the email says, if p_sender runs it: { name, code, sender }. Only the host / organizer; anyone else is refused.
create or replace function public.invite_email_target(p_sender uuid, p_kind text, p_item uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_name text; v_code text; v_live boolean := true;
begin
  if p_kind = 'round' then
    select coalesce(setup #>> '{course,name}', 'a round'), invite_code, status = 'live' into v_name, v_code, v_live from shared_rounds where id = p_item and host = p_sender;
  elsif p_kind = 'trip' then
    select t.name, t.invite_code into v_name, v_code from golf_trips t
    where t.id = p_item and exists (select 1 from golf_trip_members m where m.golf_trip_id = t.id and m.profile_id = p_sender and m.role = 'organizer');
  elsif p_kind = 'tourney' then
    select name, code, status = 'live' into v_name, v_code, v_live from code_tournaments where id = p_item and organizer = p_sender;
  elsif p_kind = 'league' then
    select name, code, status = 'live' into v_name, v_code, v_live from leagues where id = p_item and organizer = p_sender;
  else
    raise exception 'That can''t be shared.' using errcode = '22023';
  end if;
  if v_code is null then raise exception 'Only the person running it can email its code.' using errcode = '42501'; end if;
  if not v_live then raise exception 'This has ended, so there''s nothing to join.' using errcode = '22023'; end if;
  return jsonb_build_object('name', v_name, 'code', v_code, 'sender', (select display_name from profiles where id = p_sender));
end $$;

-- Records the emails about to go out and returns the ones allowed: each address once per hour for the same thing, at
-- most 50 for the same thing in all, at most 200 a day from one sender. Old records (90 days) are cleared here too.
create or replace function public.record_email_invites(p_sender uuid, p_kind text, p_item uuid, p_emails text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_allowed text[] := '{}';
  v_item_left integer;
  v_day_left integer;
begin
  perform invite_email_target(p_sender, p_kind, p_item);
  delete from email_invites_sent where sent_at < now() - interval '90 days';
  v_item_left := 50 - (select count(*) from email_invites_sent where kind = p_kind and item = p_item);
  v_day_left := 200 - (select count(*) from email_invites_sent where sender = p_sender and sent_at > now() - interval '1 day');
  if v_item_left <= 0 then raise exception 'This one has already had 50 emails sent. Share the code another way.' using errcode = '22023'; end if;
  if v_day_left <= 0 then raise exception 'You''ve sent 200 invite emails today. Try again tomorrow.' using errcode = '22023'; end if;
  foreach v_email in array (select array_agg(distinct lower(btrim(e))) from unnest(p_emails) e where btrim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') loop
    exit when cardinality(v_allowed) >= least(v_item_left, v_day_left);
    continue when exists (select 1 from email_invites_sent where kind = p_kind and item = p_item and email = v_email and sent_at > now() - interval '1 hour');
    insert into email_invites_sent (sender, kind, item, email) values (p_sender, p_kind, p_item, v_email);
    v_allowed := v_allowed || v_email;
  end loop;
  return v_allowed;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'new_invite_code(regclass)', 'clean_invite_code(text)', 'set_invite_code()',
    'shared_round_invite_code(uuid, uuid)', 'find_shared_round_by_code(uuid, text)', 'join_shared_round_by_code(uuid, text)',
    'golf_trip_invite_code(uuid, uuid)', 'reset_golf_trip_invite_code(uuid, uuid)', 'find_golf_trip_by_code(uuid, text)',
    'join_golf_trip_by_invite_code(uuid, text)', 'invite_email_target(uuid, text, uuid)', 'record_email_invites(uuid, text, uuid, text[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    if f <> 'set_invite_code()' then execute format('grant execute on function public.%s to service_role', f); end if;
  end loop;
end $$;

commit;
