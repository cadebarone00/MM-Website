-- Disabled organizer-override foundation only. Run manually AFTER the existing
-- trip scoring/corrections/player_rounds chain, following a reviewed inventory.
-- No existing table/function/policy is changed; no score-changing RPC is added.
begin;

do $$
begin
  if to_regclass('public.scorecard_submission_revisions') is null
     or to_regprocedure('public.publish_trip_submission(public.scorecard_submissions)') is null then
    raise exception 'Install the existing trip submission/corrections/history chain first.';
  end if;
  if exists (select 1 from public.scorecard_submissions s
             left join public.scoring_group_players p on p.group_id = s.group_id and p.profile_id = s.golfer_profile_id
             where s.reopened_at is not null or p.submitted_at is null)
     or exists (select 1 from public.scorecard_correction_requests where status = 'approved') then
    raise exception 'Legacy reopened/approved corrections require inventory and explicit resolution before installation.';
  end if;
end;
$$;

-- Snapshot identifiers in audit tables intentionally have no live-object FKs:
-- existing trip/profile/group deletion must neither erase the audit nor become
-- blocked by it. Future authorized operations must validate all relationships.
-- Retention/deletion of this restricted audit requires separate policy review.
create table if not exists public.golf_trip_override_events (
  request_id uuid primary key,
  actor_profile_id uuid not null default auth.uid(),
  golf_trip_id uuid not null,
  golf_trip_round_id uuid not null,
  group_id uuid not null,
  golfer_profile_id uuid not null,
  hole integer not null check (hole between 1 and 18),
  field text not null check (field in ('strokes','putts','fairway','green','penaltyFairway','penaltyGreen')),
  previous_value jsonb not null,
  new_value jsonb not null,
  reason text not null check (reason = btrim(reason) and length(reason) between 3 and 500 and reason ~ '[^[:space:]]'),
  previous_revision integer not null check (previous_revision >= 1),
  new_revision integer not null check (new_revision = previous_revision + 1),
  created_at timestamptz not null default clock_timestamp(),
  check (previous_value <> new_value),
  unique (group_id, golfer_profile_id, new_revision)
);

create or replace function public.golf_override_value_valid(p_field text, p_value jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_field = 'strokes' then jsonb_typeof(p_value) = 'number' and p_value::text ~ '^([1-9]|1[0-9]|20)$'
    when p_field = 'putts' then p_value = 'null'::jsonb or (jsonb_typeof(p_value) = 'number' and p_value::text ~ '^([0-9]|10)$')
    when p_field in ('fairway','green') then p_value in ('null'::jsonb,'"up"'::jsonb,'"left"'::jsonb,'"center"'::jsonb,'"right"'::jsonb,'"down"'::jsonb)
    when p_field in ('penaltyFairway','penaltyGreen') then jsonb_typeof(p_value) = 'boolean'
    else false end;
$$;

-- An immutable, versioned fingerprint of canonical client intent, not of the
-- server timestamp/derived old value. Integers and trimmed reasons are required
-- by constraints; JSONB removes object-key ordering differences.
create or replace function public.golf_override_fingerprint(
  p_actor uuid, p_trip uuid, p_round uuid, p_group uuid, p_golfer uuid,
  p_hole integer, p_field text, p_new jsonb, p_reason text, p_expected_revision integer)
returns text language sql immutable strict set search_path = public as $$
  select encode(sha256(convert_to(jsonb_build_object('schema',1,'actor',p_actor,
    'trip',p_trip,'round',p_round,'group',p_group,'golfer',p_golfer,'hole',p_hole,
    'field',p_field,'newValue',p_new,'reason',p_reason,'expectedRevision',p_expected_revision)::text,'UTF8')),'hex');
$$;
alter table public.golf_trip_override_events add column if not exists payload_fingerprint text
  generated always as (public.golf_override_fingerprint(actor_profile_id,golf_trip_id,golf_trip_round_id,
    group_id,golfer_profile_id,hole,field,new_value,reason,previous_revision)) stored;
alter table public.golf_trip_override_events drop constraint if exists golf_override_values_valid;
alter table public.golf_trip_override_events add constraint golf_override_values_valid
  check (public.golf_override_value_valid(field,previous_value) and public.golf_override_value_valid(field,new_value));
create index if not exists golf_override_events_history_idx
  on public.golf_trip_override_events (golf_trip_id,golf_trip_round_id,golfer_profile_id,new_revision);

-- Grant/revoke intent is append-only; no role changes or active permission
-- mutators exist yet. Future operations must use the current accepted primary
-- organizer, never created_by alone, is_host, or a client-selected actor.
create table if not exists public.golf_trip_override_delegations (
  request_id uuid primary key,
  sequence bigint generated always as identity unique,
  golf_trip_id uuid not null,
  delegate_profile_id uuid not null,
  actor_profile_id uuid not null default auth.uid(),
  action text not null check (action in ('grant','revoke')),
  reason text not null check (reason = btrim(reason) and length(reason) between 3 and 500 and reason ~ '[^[:space:]]'),
  created_at timestamptz not null default clock_timestamp(),
  check (delegate_profile_id <> actor_profile_id)
);
create index if not exists golf_override_delegations_latest_idx
  on public.golf_trip_override_delegations (golf_trip_id,delegate_profile_id,sequence desc);

-- Inert metadata, not a new live round state machine. No backfill, automatic
-- finalization or reopening. No caller can enable overrides in this foundation.
create table if not exists public.golf_trip_override_controls (
  golf_trip_id uuid primary key references public.golf_trips(id) on delete cascade,
  overrides_enabled boolean not null default false check (overrides_enabled = false),
  format text not null default 'gross_stroke_18' check (format = 'gross_stroke_18'),
  lifecycle text not null default 'unreviewed' check (lifecycle in ('unreviewed','open','finalized','reopened')),
  state_revision bigint not null default 0 check (state_revision >= 0),
  changed_by uuid,
  changed_at timestamptz not null default clock_timestamp(),
  reason text,
  check (lifecycle = 'unreviewed' or (changed_by is not null and length(btrim(reason)) between 3 and 500 and reason is not null and reason ~ '[^[:space:]]'))
);

create or replace function public.golf_override_participant(p_trip uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare active boolean;
begin
  if auth.uid() is null or to_regprocedure('public.account_is_active()') is null then return false; end if;
  execute 'select public.account_is_active()' into active;
  return coalesce(active,false) and exists (select 1 from public.golf_trip_members
    where golf_trip_id = p_trip and profile_id = auth.uid() and invitation_status = 'accepted');
end;
$$;

create or replace function public.golf_override_stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.golf_override_participant(new.golf_trip_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if tg_table_name = 'golf_trip_override_delegations' and not exists (
    select 1 from public.golf_trip_members where golf_trip_id = new.golf_trip_id
      and profile_id = auth.uid() and role = 'organizer' and invitation_status = 'accepted') then
    raise exception 'Only the primary organizer may grant or revoke override authority.' using errcode = '42501';
  end if;
  if tg_table_name = 'golf_trip_override_delegations' then
    if new.action = 'grant' and not exists (select 1 from public.golf_trip_members
      where golf_trip_id = new.golf_trip_id and profile_id = new.delegate_profile_id
        and invitation_status = 'accepted') then
      raise exception 'The delegate must be an accepted trip participant.' using errcode = '42501';
    end if;
  end if;
  new.actor_profile_id := auth.uid();
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.golf_override_insert_disabled()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Organizer overrides are disabled; no authorized operation is installed.' using errcode = '42501';
end;
$$;
create or replace function public.golf_override_audit_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Override audit is append-only.' using errcode = '42501';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['golf_trip_override_events','golf_trip_override_delegations'] loop
    execute format('drop trigger if exists override_10_actor on public.%I',t);
    execute format('create trigger override_10_actor before insert on public.%I for each row execute function public.golf_override_stamp_actor()',t);
    execute format('drop trigger if exists override_20_disabled on public.%I',t);
    execute format('create trigger override_20_disabled before insert on public.%I for each row execute function public.golf_override_insert_disabled()',t);
    execute format('drop trigger if exists override_immutable on public.%I',t);
    execute format('create trigger override_immutable before update or delete on public.%I for each row execute function public.golf_override_audit_immutable()',t);
    execute format('drop trigger if exists override_no_truncate on public.%I',t);
    execute format('create trigger override_no_truncate before truncate on public.%I for each statement execute function public.golf_override_audit_immutable()',t);
  end loop;
  foreach t in array array['golf_trip_override_events','golf_trip_override_delegations','golf_trip_override_controls'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('drop policy if exists override_participants_read on public.%I',t);
    execute format('create policy override_participants_read on public.%I for select to authenticated using (public.golf_override_participant(golf_trip_id))',t);
  end loop;
end;
$$;
revoke all on sequence public.golf_trip_override_delegations_sequence_seq from public,anon,authenticated,service_role;
revoke all on function public.golf_override_value_valid(text,jsonb),
  public.golf_override_fingerprint(uuid,uuid,uuid,uuid,uuid,integer,text,jsonb,text,integer),
  public.golf_override_participant(uuid), public.golf_override_stamp_actor(),
  public.golf_override_insert_disabled(), public.golf_override_audit_immutable()
  from public,anon,authenticated,service_role;
grant execute on function public.golf_override_participant(uuid) to authenticated;
-- Pure validation helpers are needed when a future authorized definer inserts;
-- no client needs execute privileges. No enabled grant/revoke/reopen/score RPC.
commit;
