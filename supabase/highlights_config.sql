-- supabase/highlights_config.sql — Highlights Engine phase H3: versioned rule configuration (spec: project_specs.md →
-- "Highlights Engine"). Additive and re-runnable; touches no existing table. Requires platform_foundation.sql
-- (profiles.platform_role). NOT run in production or staging yet.
--
-- Flow: the server reads an uploaded .xlsx (lib/highlights/draft.ts) and saves a DRAFT here. Nothing is live until a
-- platform admin explicitly PUBLISHES a draft, which creates a new immutable VERSION and moves the ACTIVE pointer.
-- ROLLBACK moves the pointer back to any earlier version; versions are never edited or deleted. Every upload, publish,
-- rollback and discard is written to an append-only AUDIT log. The original spreadsheet file is never stored — only
-- its name, size and SHA-256.
--
-- Security: all four tables have RLS on with no policies; anon/authenticated get nothing; the server (service_role)
-- may only SELECT. Every write goes through the security-definer functions below, which re-check that the actor is a
-- platform admin (profiles.platform_role = 'admin'). Only service_role may call them.

begin;

-- Same definition as supabase/historical_import.sql (that file isn't in production either); safe to run in any order.
create or replace function public.is_platform_admin(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_profile and platform_role = 'admin');
$$;

-- --- Structural check (defense in depth; the full rules live in lib/highlights/validator.ts) -------------------------
-- Returns plain-English problems with a config's shape: schema version 2, rule / conditional / variation IDs, their
-- parent prefixes, uniqueness, statuses, categories and the legacy V00 convention. Empty array = structurally sound.
create or replace function public.highlight_config_problems(p_config jsonb)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  problems text[] := array[]::text[];
  seen text[] := array[]::text[];
  r jsonb; c jsonb; v jsonb; rid text; cid text; vid text;
  statuses constant text[] := array['Draft', 'Approved', 'Disabled'];
  categories constant text[] := array['Individual performance', 'Match play drama', 'Team competition',
    'Individual leaderboard', 'Trip and tournament milestones', 'Fun and social highlights'];
begin
  if jsonb_typeof(p_config) is distinct from 'object' then return array['Config must be a JSON object.']; end if;
  if p_config->'schemaVersion' is distinct from '2'::jsonb then problems := problems || 'schemaVersion must be 2.'; end if;
  if jsonb_typeof(p_config->'rules') is distinct from 'array' then return problems || 'rules must be an array.'; end if;

  for r in select value from jsonb_array_elements(p_config->'rules') loop
    rid := r->>'id';
    if rid is null or rid !~ '^HL-[0-9]{3}$' then problems := problems || format('Bad rule ID %L.', rid);
    elsif rid = any(seen) then problems := problems || format('Duplicate ID %s.', rid); end if;
    seen := seen || coalesce(rid, '');
    if not coalesce(r->>'status' = any(statuses), false) then problems := problems || format('Rule %s has bad status %L.', rid, r->>'status'); end if;
    if not coalesce(r->>'category' = any(categories), false) then problems := problems || format('Rule %s has bad category %L.', rid, r->>'category'); end if;
    if jsonb_typeof(r->'conditionals') is distinct from 'array' then problems := problems || format('Rule %s has no conditionals array.', rid); continue; end if;

    for c in select value from jsonb_array_elements(r->'conditionals') loop
      cid := c->>'id';
      if cid is null or cid !~ '^HL-[0-9]{3}-C[0-9]{2}$' or left(cid, 6) is distinct from rid then problems := problems || format('Bad conditional ID %L under %s.', cid, rid);
      elsif cid = any(seen) then problems := problems || format('Duplicate ID %s.', cid); end if;
      seen := seen || coalesce(cid, '');
      if not coalesce(c->>'status' = any(statuses), false) then problems := problems || format('Conditional %s has bad status %L.', cid, c->>'status'); end if;
      if jsonb_typeof(c->'tier') not in ('null', 'number', 'string') then problems := problems || format('Conditional %s has a bad tier.', cid); end if;
      if jsonb_typeof(c->'variations') is distinct from 'array' then problems := problems || format('Conditional %s has no variations array.', cid); continue; end if;

      for v in select value from jsonb_array_elements(c->'variations') loop
        vid := v->>'id';
        if vid is null or vid !~ '^HL-[0-9]{3}-C[0-9]{2}-V[0-9]{2}$' or left(vid, 10) is distinct from cid then problems := problems || format('Bad variation ID %L under %s.', vid, cid);
        elsif vid = any(seen) then problems := problems || format('Duplicate ID %s.', vid); end if;
        seen := seen || coalesce(vid, '');
        if not coalesce(v->>'status' = any(statuses), false) then problems := problems || format('Variation %s has bad status %L.', vid, v->>'status'); end if;
        if jsonb_typeof(v->'legacy') is distinct from 'boolean' or (v->>'legacy')::boolean <> coalesce(right(vid, 4) = '-V00', false) then
          problems := problems || format('Variation %s: V00 is exactly the legacy message.', vid);
        end if;
        if jsonb_typeof(v->'headline') is distinct from 'string' or jsonb_typeof(v->'body') is distinct from 'string' then
          problems := problems || format('Variation %s needs text headline and body.', vid);
        end if;
      end loop;
    end loop;
  end loop;
  return problems;
end; $$;

-- --- Tables -----------------------------------------------------------------------------------------------------------
create table if not exists public.highlight_config_versions (
  version integer generated always as identity primary key,
  config jsonb not null check (octet_length(config::text) <= 2000000),
  config_fingerprint text not null check (config_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  schema_version integer not null check (schema_version = 2),
  change_kind text not null check (change_kind in ('metadata', 'copy', 'behavior')),
  changes jsonb not null,
  from_draft_id uuid not null unique,
  previous_version integer references public.highlight_config_versions(version),
  file_name text not null,
  file_fingerprint text not null check (file_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  note text check (note is null or char_length(note) <= 500),
  -- Plain IDs (no foreign key): deleting an account must never be blocked by, or rewrite, this permanent history.
  published_by uuid not null,
  published_at timestamptz not null default now()
);

create table if not exists public.highlight_config_drafts (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_bytes integer not null check (file_bytes between 1 and 2097152),
  file_fingerprint text not null check (file_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  config jsonb not null check (octet_length(config::text) <= 2000000),
  config_fingerprint text not null check (config_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  schema_version integer not null check (schema_version = 2),
  report jsonb not null check (octet_length(report::text) <= 2000000),
  changes jsonb not null check (octet_length(changes::text) <= 2000000),
  change_kind text not null check (change_kind in ('none', 'metadata', 'copy', 'behavior')),
  has_errors boolean not null,
  -- The live version this draft was compared with (null = nothing published yet). Publish is refused if it moved.
  base_version integer references public.highlight_config_versions(version),
  status text not null default 'pending' check (status in ('pending', 'published', 'discarded')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  resolved_by uuid,
  resolved_at timestamptz
);
create index if not exists highlight_config_drafts_recent on public.highlight_config_drafts (created_at desc);

alter table public.highlight_config_versions drop constraint if exists highlight_config_versions_from_draft_fkey;
alter table public.highlight_config_versions add constraint highlight_config_versions_from_draft_fkey
  foreign key (from_draft_id) references public.highlight_config_drafts(id);

create table if not exists public.highlight_config_active (
  singleton boolean primary key default true check (singleton),
  version integer not null references public.highlight_config_versions(version),
  reason text not null check (reason in ('publish', 'rollback')),
  activated_by uuid not null,
  activated_at timestamptz not null default now()
);

create table if not exists public.highlight_config_audit (
  id bigint generated always as identity primary key,
  action text not null check (action in ('upload', 'publish', 'rollback', 'discard')),
  actor uuid not null,
  draft_id uuid,
  version integer,
  from_version integer,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists highlight_config_audit_recent on public.highlight_config_audit (at desc);

-- Published versions and the audit log can never be changed or removed — not even by the table owner without
-- first dropping these triggers (which would show up in any schema review).
create or replace function public.highlight_config_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception '% rows are permanent and cannot be changed or removed.', TG_TABLE_NAME using errcode = '42501';
end; $$;
drop trigger if exists highlight_config_versions_immutable on public.highlight_config_versions;
create trigger highlight_config_versions_immutable before update or delete on public.highlight_config_versions
  for each row execute function public.highlight_config_append_only();
drop trigger if exists highlight_config_versions_no_truncate on public.highlight_config_versions;
create trigger highlight_config_versions_no_truncate before truncate on public.highlight_config_versions
  for each statement execute function public.highlight_config_append_only();
drop trigger if exists highlight_config_audit_immutable on public.highlight_config_audit;
create trigger highlight_config_audit_immutable before update or delete on public.highlight_config_audit
  for each row execute function public.highlight_config_append_only();
drop trigger if exists highlight_config_audit_no_truncate on public.highlight_config_audit;
create trigger highlight_config_audit_no_truncate before truncate on public.highlight_config_audit
  for each statement execute function public.highlight_config_append_only();

-- --- Privileges -------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['highlight_config_versions', 'highlight_config_drafts', 'highlight_config_active', 'highlight_config_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to service_role', t);
  end loop;
end $$;

-- --- Functions (all writes) ------------------------------------------------------------------------------------------
create or replace function public.highlight_config_require_admin(p_actor uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_actor is null or not is_platform_admin(p_actor) then
    raise exception 'Only a platform admin can change highlight configuration.' using errcode = '42501';
  end if;
end; $$;

create or replace function public.highlight_config_current_version()
returns integer language sql stable security definer set search_path = public as $$
  select version from highlight_config_active where singleton;
$$;

-- Saves one upload as a pending draft. p_draft is lib/highlights/configRows.ts → draftRowPayload().
-- p_draft.baseVersion must be the version that was live when the server compared the upload; if another version went
-- live in between, the comparison is stale and the upload is refused (upload again).
create or replace function public.save_highlight_draft(p_actor uuid, p_draft jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_base integer := (p_draft->>'baseVersion')::integer; v_problems text[];
  v_has_errors boolean := not coalesce((p_draft->'report'->>'ok')::boolean, false);
begin
  perform highlight_config_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtext('highlight_config'));
  if v_base is distinct from highlight_config_current_version() then
    raise exception 'The live highlight configuration changed while this file was being checked. Upload it again.' using errcode = 'HL409';
  end if;
  if not v_has_errors then
    v_problems := highlight_config_problems(p_draft->'config');
    if cardinality(v_problems) > 0 then
      raise exception 'Draft config failed the database check: %', array_to_string(v_problems[1:5], ' ') using errcode = '22023';
    end if;
  end if;
  insert into highlight_config_drafts (file_name, file_bytes, file_fingerprint, config, config_fingerprint, schema_version,
    report, changes, change_kind, has_errors, base_version, created_by)
  values (p_draft->>'fileName', (p_draft->>'fileBytes')::integer, p_draft->>'fileFingerprint', p_draft->'config',
    p_draft->>'configFingerprint', (p_draft->'config'->>'schemaVersion')::integer, p_draft->'report', p_draft->'changes',
    p_draft->'changes'->>'kind', v_has_errors, v_base, p_actor)
  returning id into v_id;
  insert into highlight_config_audit (action, actor, draft_id, version, detail)
  values ('upload', p_actor, v_id, v_base, jsonb_build_object('fileName', p_draft->>'fileName', 'fileFingerprint', p_draft->>'fileFingerprint',
    'configFingerprint', p_draft->>'configFingerprint', 'changeKind', p_draft->'changes'->>'kind', 'hasErrors', v_has_errors));
  return v_id;
end; $$;

-- Publishes a pending draft as a new immutable version and makes it live, all in one transaction.
-- Refused when: not an admin; draft not pending or expired; it has errors; it changes nothing players would see;
-- it changes behavior without p_confirm_behavior; or another version went live after it was uploaded (stale).
create or replace function public.publish_highlight_draft(p_actor uuid, p_draft uuid, p_confirm_behavior boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d highlight_config_drafts; v_current integer; v_version integer; v_problems text[];
begin
  perform highlight_config_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtext('highlight_config'));
  select * into d from highlight_config_drafts where id = p_draft for update;
  if d.id is null then raise exception 'Draft not found.' using errcode = 'P0002'; end if;
  if d.status <> 'pending' then raise exception 'This draft was already %.', d.status using errcode = '55000'; end if;
  if d.expires_at <= now() then raise exception 'This draft expired. Upload the file again.' using errcode = '55000'; end if;
  if d.has_errors then raise exception 'This draft has errors and cannot be published.' using errcode = '22023'; end if;
  if d.change_kind = 'none' then raise exception 'This draft changes nothing players would see.' using errcode = '22023'; end if;
  if d.change_kind = 'behavior' and not coalesce(p_confirm_behavior, false) then
    raise exception 'This draft changes which highlights fire. Confirm the behavior change to publish.' using errcode = '22023';
  end if;
  v_current := highlight_config_current_version();
  if d.base_version is distinct from v_current then
    raise exception 'Another version went live after this file was uploaded (draft compared with v%, live is v%). Upload it again.',
      coalesce(d.base_version::text, 'none'), coalesce(v_current::text, 'none') using errcode = 'HL409';
  end if;
  v_problems := highlight_config_problems(d.config);
  if cardinality(v_problems) > 0 then
    raise exception 'Draft config failed the database check: %', array_to_string(v_problems[1:5], ' ') using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'Note is too long (500 characters max).' using errcode = '22023'; end if;

  insert into highlight_config_versions (config, config_fingerprint, schema_version, change_kind, changes, from_draft_id,
    previous_version, file_name, file_fingerprint, note, published_by)
  values (d.config, d.config_fingerprint, d.schema_version, d.change_kind, d.changes, d.id, v_current, d.file_name,
    d.file_fingerprint, nullif(btrim(p_note), ''), p_actor)
  returning version into v_version;
  insert into highlight_config_active (singleton, version, reason, activated_by, activated_at)
  values (true, v_version, 'publish', p_actor, now())
  on conflict (singleton) do update set version = excluded.version, reason = excluded.reason,
    activated_by = excluded.activated_by, activated_at = excluded.activated_at;
  update highlight_config_drafts set status = 'published', resolved_by = p_actor, resolved_at = now() where id = d.id;
  insert into highlight_config_audit (action, actor, draft_id, version, from_version, detail)
  values ('publish', p_actor, d.id, v_version, v_current, jsonb_build_object('changeKind', d.change_kind,
    'configFingerprint', d.config_fingerprint, 'behaviorConfirmed', coalesce(p_confirm_behavior, false)));
  return jsonb_build_object('version', v_version, 'previousVersion', v_current, 'changeKind', d.change_kind);
end; $$;

-- Makes an earlier (or later) published version live again. p_expected_version must be the version the admin saw as
-- live; if it moved meanwhile the rollback is refused. Versions themselves never change.
create or replace function public.rollback_highlight_config(p_actor uuid, p_target_version integer, p_expected_version integer, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_current integer; v_target highlight_config_versions;
begin
  perform highlight_config_require_admin(p_actor);
  perform pg_advisory_xact_lock(hashtext('highlight_config'));
  v_current := highlight_config_current_version();
  if v_current is null then raise exception 'Nothing has been published yet.' using errcode = '55000'; end if;
  if p_expected_version is distinct from v_current then
    raise exception 'The live version changed (now v%). Refresh and try again.', v_current using errcode = 'HL409';
  end if;
  select * into v_target from highlight_config_versions where version = p_target_version;
  if v_target.version is null then raise exception 'Version % does not exist.', p_target_version using errcode = 'P0002'; end if;
  if v_target.version = v_current then raise exception 'Version % is already live.', v_current using errcode = '55000'; end if;
  if cardinality(highlight_config_problems(v_target.config)) > 0 then
    raise exception 'Version % no longer passes the database check and cannot go live.', p_target_version using errcode = '22023';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'Reason is too long (500 characters max).' using errcode = '22023'; end if;
  update highlight_config_active set version = v_target.version, reason = 'rollback', activated_by = p_actor, activated_at = now() where singleton;
  insert into highlight_config_audit (action, actor, version, from_version, detail)
  values ('rollback', p_actor, v_target.version, v_current, jsonb_build_object('reason', nullif(btrim(p_reason), '')));
  return jsonb_build_object('version', v_target.version, 'previousVersion', v_current);
end; $$;

create or replace function public.discard_highlight_draft(p_actor uuid, p_draft uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  perform highlight_config_require_admin(p_actor);
  select status into v_status from highlight_config_drafts where id = p_draft for update;
  if v_status is null then raise exception 'Draft not found.' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then raise exception 'This draft was already %.', v_status using errcode = '55000'; end if;
  update highlight_config_drafts set status = 'discarded', resolved_by = p_actor, resolved_at = now() where id = p_draft;
  insert into highlight_config_audit (action, actor, draft_id) values ('discard', p_actor, p_draft);
end; $$;

-- What the Highlights Engine reads (server only, no admin needed): the live version, or null before the first publish.
create or replace function public.get_active_highlight_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', v.version, 'config', v.config, 'configFingerprint', v.config_fingerprint)
  from highlight_config_active a join highlight_config_versions v on v.version = a.version where a.singleton;
$$;

-- Version history for the Admin Center (admins only): newest first, without the full configs.
create or replace function public.list_highlight_config_versions(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform highlight_config_require_admin(p_actor);
  return jsonb_build_object('active', highlight_config_current_version(), 'versions', coalesce((
    select jsonb_agg(jsonb_build_object('version', version, 'changeKind', change_kind, 'configFingerprint', config_fingerprint,
      'fileName', file_name, 'note', note, 'previousVersion', previous_version, 'publishedBy', published_by, 'publishedAt', published_at)
      order by version desc)
    from highlight_config_versions), '[]'::jsonb));
end; $$;

do $$
declare f text;
begin
  foreach f in array array['is_platform_admin(uuid)', 'highlight_config_problems(jsonb)', 'highlight_config_append_only()',
    'highlight_config_require_admin(uuid)', 'highlight_config_current_version()', 'save_highlight_draft(uuid, jsonb)',
    'publish_highlight_draft(uuid, uuid, boolean, text)', 'rollback_highlight_config(uuid, integer, integer, text)',
    'discard_highlight_draft(uuid, uuid)', 'get_active_highlight_config()', 'list_highlight_config_versions(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function public.save_highlight_draft(uuid, jsonb), public.publish_highlight_draft(uuid, uuid, boolean, text),
  public.rollback_highlight_config(uuid, integer, integer, text), public.discard_highlight_draft(uuid, uuid),
  public.get_active_highlight_config(), public.list_highlight_config_versions(uuid), public.highlight_config_problems(jsonb)
  to service_role;

commit;
