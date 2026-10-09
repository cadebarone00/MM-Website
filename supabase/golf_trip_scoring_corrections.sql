-- supabase/golf_trip_scoring_corrections.sql
-- Player & Attest Step 6: controlled corrections to a submitted card, reopening, and audit history.
--
--   scorecard_submission_revisions  every submission ever made, one row per revision (1 = first submit, 2 = after the
--                                   first approved correction, …). Never changed: direct UPDATE / DELETE are refused
--                                   by a trigger (deleting the whole trip still cascades).
--   scorecard_correction_requests   a golfer asks to correct their OWN submitted card: which holes and why. At most one
--                                   open request (pending or approved) per golfer per group. Status:
--                                   pending → denied, or pending → approved (card reopened) → resubmitted.
--   scorecard_submissions           stays the CURRENT submission; gains revision and reopened_at.
--
-- Rules (enforced here, in the database):
--   * Only the golfer requests, only for their own card, only while it is submitted, with 1–18 holes and a reason, and
--     only for a round already played (its date has come; any later day works, completed trips included; the round
--     keeps its own date and nothing moves to another round).
--   * Who sees requests, reasons and submission snapshots (can_view_scorecard_corrections, also the RLS policies): the
--     golfer, their designated attester and the trip organizer. Other trip members don't.
--   * Who decides (can_decide_scorecard_correction): a trip organizer, but never on their own request. An organizer's
--     own card is decided by that golfer's designated attester (a different account, still on the trip; a trip has one
--     organizer). The requesting account can never decide its own request. Deciding never sets a score (nobody can change
--     anyone's card through this). Pending and denied requests never unlock anything. Denying needs a reason (checked by
--     decide_scorecard_correction and a table constraint); who / when / why are kept and shown to the golfer.
--   * Approval reopens only that golfer's card (scoring_group_players.submitted_at cleared) and, on the approved holes
--     only: bumps the golfer's own rows' versions (scores unchanged) and CLEARS the attester's strokes (the old
--     attestation no longer counts). last_op_id is cleared. So a change still queued on a phone from before the lock is
--     answered "conflict" by save_hole_score_ops instead of silently applying.
--   * While a correction is approved, only its holes can be written, by the golfer or the attester, on every save path
--     (trigger hole_score_entries_correction_guard; save_hole_score_ops answers "locked" for the other holes, and the
--     older save_hole_scores, which has no versions, is refused for that card).
--   * Fresh attestation: the attester's op for an approved hole must carry that request's id (the phone adds it only to
--     an entry made after the approval). Without it (queued before the approval, or resent with Keep mine) the op is
--     answered "locked" and nothing is written. Saved with it, the row is stamped (correction_request_id): the
--     database's record of the new attestation for this correction.
--   * Resubmitting runs the full Step 5 check again (all 18 complete, attester matches every hole, card version), plus:
--     every approved hole has a fresh attestation for this request (else "unattested", told apart from "mismatch").
--     Then it writes a new revision (the stored hole-by-hole snapshot, never recalculated), makes it current, and marks
--     the request resubmitted.
--   * Reading: get_scorecard_corrections (one round: requests + revisions with snapshots, canDecide) and
--     list_trip_corrections (Trip Settings → Corrections: every round with its date, every visible request).
--   * Every function takes the same group lock as score writes and submissions (select … for update on scoring_groups).
--
-- This file replaces save_hole_scores (golf_trip_scoring.sql), save_hole_score_ops (golf_trip_scoring_offline.sql) and
-- submit_trip_scorecard (golf_trip_scoring_submission.sql). If one of those files is ever run again, run this one again
-- after it. (The trigger keeps unapproved holes locked either way.)
--
-- Prerequisites: golf_trip_scoring.sql (+ golf_trip_scoring_fix_groups.sql), golf_trip_scoring_offline.sql,
-- golf_trip_scoring_submission.sql. Additive: new tables, two new columns, new functions; submit_trip_scorecard is
-- replaced by a version that also handles reopened cards (first submissions behave exactly as before). Existing
-- submissions are copied into the history as revision 1. Safe to run more than once.

begin;

alter table public.scorecard_submissions add column if not exists revision integer not null default 1;
alter table public.scorecard_submissions add column if not exists reopened_at timestamptz;

create table if not exists public.scorecard_submission_revisions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  golfer_profile_id uuid not null,
  revision integer not null check (revision >= 1),
  submitted_at timestamptz not null,
  submitted_by uuid not null references public.profiles(id),
  card_version integer not null check (card_version >= 0),
  card jsonb not null check (jsonb_typeof(card) = 'array'),
  -- The approved correction this revision answers (null for revision 1).
  correction_request_id uuid,
  created_at timestamptz not null default now(),
  unique (group_id, golfer_profile_id, revision),
  foreign key (group_id, golfer_profile_id) references public.scoring_group_players(group_id, profile_id) on delete cascade
);

-- History is permanent: no edits, no direct deletes. (A delete cascading from the trip / group runs at trigger depth > 1.)
create or replace function public.scorecard_revisions_immutable()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Submission history can''t be changed.' using errcode = '42501';
end;
$$;
drop trigger if exists scorecard_revisions_immutable on public.scorecard_submission_revisions;
create trigger scorecard_revisions_immutable before update or delete on public.scorecard_submission_revisions
  for each row execute function public.scorecard_revisions_immutable();

-- Cards submitted before this file existed become revision 1.
insert into public.scorecard_submission_revisions (group_id, golfer_profile_id, revision, submitted_at, submitted_by, card_version, card)
select s.group_id, s.golfer_profile_id, s.revision, s.submitted_at, s.submitted_by, s.card_version, s.card from public.scorecard_submissions s
on conflict (group_id, golfer_profile_id, revision) do nothing;

create table if not exists public.scorecard_correction_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  golfer_profile_id uuid not null,
  golf_trip_id uuid references public.golf_trips(id) on delete cascade,
  -- The submitted revision this asks to correct.
  revision integer not null check (revision >= 1),
  holes integer[] not null check (cardinality(holes) between 1 and 18 and 1 <= all(holes) and 18 >= all(holes)),
  reason text not null check (length(trim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'resubmitted')),
  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  resubmitted_at timestamptz,
  foreign key (group_id, golfer_profile_id) references public.scoring_group_players(group_id, profile_id) on delete cascade
);
-- One open request per golfer per group (pending, or approved and waiting for the resubmission).
create unique index if not exists scorecard_correction_requests_open_idx on public.scorecard_correction_requests (group_id, golfer_profile_id)
  where status in ('pending', 'approved');
-- A denial always says why (Step 6 gap 6).
alter table public.scorecard_correction_requests drop constraint if exists scorecard_correction_requests_denial_reason;
alter table public.scorecard_correction_requests add constraint scorecard_correction_requests_denial_reason
  check (status <> 'denied' or length(trim(coalesce(decision_note, ''))) > 0);

-- Who may see a golfer's correction requests and submission snapshots: the golfer, their designated attester, and the
-- trip organizer. (Other trip members don't see reasons or snapshots.)
create or replace function public.can_view_scorecard_corrections(p_group uuid, p_golfer uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile is not null and (p_profile = p_golfer
    or exists (select 1 from scoring_group_players p where p.group_id = p_group and p.profile_id = p_golfer and p.attester_profile_id = p_profile)
    or exists (select 1 from scoring_groups g join golf_trip_members m on m.golf_trip_id = g.golf_trip_id
               where g.id = p_group and m.profile_id = p_profile and m.role = 'organizer'));
$$;
revoke all on function public.can_view_scorecard_corrections(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_view_scorecard_corrections(uuid, uuid, uuid) to authenticated, service_role;

alter table public.scorecard_submission_revisions enable row level security;
alter table public.scorecard_correction_requests enable row level security;
drop policy if exists scorecard_submission_revisions_select on public.scorecard_submission_revisions;
create policy scorecard_submission_revisions_select on public.scorecard_submission_revisions for select to authenticated
  using (public.can_view_scorecard_corrections(group_id, golfer_profile_id, auth.uid()));
drop policy if exists scorecard_correction_requests_select on public.scorecard_correction_requests;
create policy scorecard_correction_requests_select on public.scorecard_correction_requests for select to authenticated
  using (public.can_view_scorecard_corrections(group_id, golfer_profile_id, auth.uid()));
revoke all on public.scorecard_submission_revisions, public.scorecard_correction_requests from anon, authenticated;
grant select on public.scorecard_submission_revisions, public.scorecard_correction_requests to authenticated;

-- An attester's strokes saved for an approved correction hole as a NEW attestation for that request. Proposed only by
-- save_hole_score_ops (for an op made for the open correction) and kept only if the trigger below agrees.
alter table public.hole_score_entries add column if not exists correction_request_id uuid;

-- While a golfer's correction is approved, only its holes take writes (golfer or attester, any save path). An attester's
-- strokes on them keep the stamp only when the writer proposed exactly this request (an explicit new attestation), so a
-- write that doesn't say so never counts. With no approved correction, the stamp never changes.
create or replace function public.hole_score_entries_correction_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_request scorecard_correction_requests;
begin
  select * into v_request from scorecard_correction_requests
    where group_id = new.group_id and golfer_profile_id = new.scored_profile_id and status = 'approved';
  if v_request.id is null then
    new.correction_request_id := case when tg_op = 'UPDATE' then old.correction_request_id end;
    return new;
  end if;
  if not (new.hole = any (v_request.holes)) or (tg_op = 'UPDATE' and not (old.hole = any (v_request.holes))) then
    raise exception 'That hole isn''t part of the approved correction.' using errcode = '42501';
  end if;
  new.correction_request_id := case when new.entered_by_profile_id <> new.scored_profile_id and new.strokes is not null
    and new.correction_request_id is not distinct from v_request.id then v_request.id end;
  return new;
end;
$$;
drop trigger if exists hole_score_entries_correction_guard on public.hole_score_entries;
create trigger hole_score_entries_correction_guard before insert or update on public.hole_score_entries
  for each row execute function public.hole_score_entries_correction_guard();

-- May p_profile approve / deny this request? Never the golfer or the account that asked. The trip organizer may; for
-- the organizer's own card, that golfer's designated attester (still a member of the trip) may.
create or replace function public.can_decide_scorecard_correction(p_profile uuid, r public.scorecard_correction_requests)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile is not null and p_profile <> r.golfer_profile_id and p_profile <> r.requested_by
    and exists (select 1 from scoring_groups g where g.id = r.group_id and (
      exists (select 1 from golf_trip_members m where m.golf_trip_id = g.golf_trip_id and m.profile_id = p_profile and m.role = 'organizer')
      or (exists (select 1 from golf_trip_members m where m.golf_trip_id = g.golf_trip_id and m.profile_id = r.golfer_profile_id and m.role = 'organizer')
          and is_golf_trip_member(g.golf_trip_id, p_profile)
          and exists (select 1 from scoring_group_players p where p.group_id = r.group_id and p.profile_id = r.golfer_profile_id and p.attester_profile_id = p_profile))));
$$;

create or replace function public.correction_request_json(r public.scorecard_correction_requests)
returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', r.id, 'groupId', r.group_id, 'golferProfileId', r.golfer_profile_id, 'revision', r.revision,
    'holes', to_jsonb(r.holes), 'reason', r.reason, 'status', r.status, 'requestedAt', r.requested_at,
    'decidedBy', r.decided_by, 'decidedAt', r.decided_at, 'decisionNote', r.decision_note, 'resubmittedAt', r.resubmitted_at);
$$;

-- A request as p_profile sees it in a list: plus names, its round, and whether p_profile may decide it (canDecide).
create or replace function public.correction_request_view(p_profile uuid, r public.scorecard_correction_requests)
returns jsonb
language sql stable security definer set search_path = public as $$
  select correction_request_json(r) || jsonb_build_object(
    'canDecide', r.status = 'pending' and can_decide_scorecard_correction(p_profile, r),
    'golferName', coalesce((select m.display_name from golf_trip_members m where m.golf_trip_id = g.golf_trip_id and m.profile_id = r.golfer_profile_id), 'Player'),
    'decidedByName', (select m.display_name from golf_trip_members m where m.golf_trip_id = g.golf_trip_id and m.profile_id = r.decided_by),
    'roundNumber', t.round_number, 'playDate', t.play_date)
  from scoring_groups g join golf_trip_rounds t on t.id = g.golf_trip_round_id where g.id = r.group_id;
$$;

-- The golfer asks to correct their own submitted card. Answers {status: requested | duplicate, request}.
create or replace function public.request_scorecard_correction(p_profile uuid, p_group uuid, p_golfer uuid, p_holes integer[], p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group scoring_groups;
  v_player scoring_group_players;
  v_submission scorecard_submissions;
  v_request scorecard_correction_requests;
  v_holes integer[];
begin
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then raise exception 'Group not found.' using errcode = 'P0002'; end if;
  if p_profile <> p_golfer then raise exception 'You can only ask to correct your own card.' using errcode = '42501'; end if;
  select * into v_player from scoring_group_players where group_id = p_group and profile_id = p_golfer;
  select * into v_submission from scorecard_submissions where group_id = p_group and golfer_profile_id = p_golfer;

  select * into v_request from scorecard_correction_requests where group_id = p_group and golfer_profile_id = p_golfer and status = 'pending';
  if v_request.id is not null then return jsonb_build_object('status', 'duplicate', 'request', correction_request_json(v_request)); end if;
  if v_submission.id is null or v_submission.reopened_at is not null or v_player.submitted_at is null then
    raise exception 'Only a submitted card can be corrected.' using errcode = '22023';
  end if;
  -- Only a round that has been played (its date has come; any later day is fine, the round keeps its own date).
  if not exists (select 1 from golf_trip_rounds t where t.id = v_group.golf_trip_round_id and t.play_date is not null and t.play_date <= current_date) then
    raise exception 'This round hasn''t been played yet.' using errcode = '22023';
  end if;

  select array_agg(distinct h order by h) into v_holes from unnest(coalesce(p_holes, '{}')) h;
  if v_holes is null or cardinality(v_holes) <> cardinality(p_holes) or exists (select 1 from unnest(v_holes) h where h not between 1 and 18) then
    raise exception 'Pick the holes to correct (each once, 1–18).' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Say why the card needs correcting (3–500 characters).' using errcode = '22023';
  end if;

  insert into scorecard_correction_requests (group_id, golfer_profile_id, golf_trip_id, revision, holes, reason, requested_by)
  values (p_group, p_golfer, v_group.golf_trip_id, v_submission.revision, v_holes, trim(p_reason), p_profile)
  returning * into v_request;
  return jsonb_build_object('status', 'requested', 'request', correction_request_json(v_request));
end;
$$;

-- The trip organizer (or, for an organizer's own card, their attester: can_decide_scorecard_correction) approves or
-- denies. Approval reopens only that golfer's card, only on the approved holes. Deciding twice returns the first
-- decision. Answers {status: approved | denied | already-decided, request}.
create or replace function public.decide_scorecard_correction(p_profile uuid, p_request uuid, p_approve boolean, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_request scorecard_correction_requests;
  v_group scoring_groups;
begin
  select * into v_request from scorecard_correction_requests where id = p_request;
  if v_request.id is null then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  -- The same group lock as every score write and submission.
  select * into v_group from scoring_groups where id = v_request.group_id for update;
  if p_profile = v_request.golfer_profile_id or p_profile = v_request.requested_by then
    raise exception 'You can''t decide your own correction request.' using errcode = '42501';
  end if;
  if not can_decide_scorecard_correction(p_profile, v_request) then
    raise exception 'Only the trip organizer can decide corrections (or, for the organizer''s card, their attester).' using errcode = '42501';
  end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'Keep the note under 500 characters.' using errcode = '22023'; end if;
  select * into v_request from scorecard_correction_requests where id = p_request for update;
  if v_request.status <> 'pending' then return jsonb_build_object('status', 'already-decided', 'request', correction_request_json(v_request)); end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say why the request is denied.' using errcode = '22023';
  end if;

  update scorecard_correction_requests set status = case when p_approve then 'approved' else 'denied' end,
    decided_by = p_profile, decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_request returning * into v_request;

  if p_approve then
    update scoring_group_players set submitted_at = null where group_id = v_request.group_id and profile_id = v_request.golfer_profile_id;
    update scorecard_submissions set reopened_at = now() where group_id = v_request.group_id and golfer_profile_id = v_request.golfer_profile_id;
    -- Approved holes only (every other hole stays locked). Anything still queued on a phone from before the lock was
    -- based on these versions: it now conflicts instead of applying. The golfer's own scores stay as they were.
    update hole_score_entries set version = version + 1, last_op_id = null, updated_at = now()
    where group_id = v_request.group_id and scored_profile_id = v_request.golfer_profile_id
      and entered_by_profile_id = v_request.golfer_profile_id and hole = any (v_request.holes);
    -- The attester's old strokes on those holes no longer count: cleared, so they must attest them again (the revision
    -- snapshot keeps what they were).
    update hole_score_entries set strokes = null, version = version + 1, last_op_id = null, updated_at = now()
    where group_id = v_request.group_id and scored_profile_id = v_request.golfer_profile_id
      and entered_by_profile_id <> v_request.golfer_profile_id and hole = any (v_request.holes);
  end if;
  return jsonb_build_object('status', v_request.status, 'request', correction_request_json(v_request));
end;
$$;

-- A submission revision as a list item: who / when, the correction it answered (with its reason), the stored hole-by-hole
-- snapshot (never recalculated), and whether it is the current official card.
create or replace function public.submission_revision_view(v public.scorecard_submission_revisions, p_trip uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('groupId', v.group_id, 'golferProfileId', v.golfer_profile_id, 'revision', v.revision,
    'submittedAt', v.submitted_at, 'submittedBy', v.submitted_by, 'cardVersion', v.card_version, 'correctionRequestId', v.correction_request_id,
    'submittedByName', coalesce((select m.display_name from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = v.submitted_by), 'Player'),
    'reason', (select r.reason from scorecard_correction_requests r where r.id = v.correction_request_id),
    'isCurrent', exists (select 1 from scorecard_submissions s where s.group_id = v.group_id and s.golfer_profile_id = v.golfer_profile_id and s.revision = v.revision),
    'card', v.card);
$$;

-- A trip round's correction requests and submission history. Null when not on the trip / no such round. Only what
-- p_profile may see (can_view_scorecard_corrections: the golfer, their attester, the organizer); each request says
-- whether p_profile may decide it (canDecide).
create or replace function public.get_scorecard_corrections(p_profile uuid, p_trip uuid, p_round_number integer)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_round golf_trip_rounds;
begin
  if golf_trip_member_id(p_profile, p_trip) is null then return null; end if;
  select * into v_round from golf_trip_rounds where golf_trip_id = p_trip and round_number = p_round_number;
  if v_round.id is null then return null; end if;
  return jsonb_build_object(
    'isOrganizer', exists (select 1 from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = p_profile and m.role = 'organizer'),
    'requests', coalesce((select jsonb_agg(correction_request_view(p_profile, r) order by r.requested_at)
      from scorecard_correction_requests r join scoring_groups g on g.id = r.group_id
      where g.golf_trip_round_id = v_round.id and can_view_scorecard_corrections(r.group_id, r.golfer_profile_id, p_profile)), '[]'::jsonb),
    'revisions', coalesce((select jsonb_agg(submission_revision_view(v, p_trip) order by v.golfer_profile_id, v.revision)
      from scorecard_submission_revisions v join scoring_groups g on g.id = v.group_id
      where g.golf_trip_round_id = v_round.id and can_view_scorecard_corrections(v.group_id, v.golfer_profile_id, p_profile)), '[]'::jsonb));
end;
$$;

-- Trip Settings → Corrections (works on any day, for organizers who aren't playing too). Null when not on the trip.
--   rounds    every round of the trip with its own date; played = its date has come; mySubmitted / myReopened = my card.
--   requests  every request p_profile may see, newest first, with round, names and canDecide.
create or replace function public.list_trip_corrections(p_profile uuid, p_trip uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if golf_trip_member_id(p_profile, p_trip) is null then return null; end if;
  return jsonb_build_object(
    'isOrganizer', exists (select 1 from golf_trip_members m where m.golf_trip_id = p_trip and m.profile_id = p_profile and m.role = 'organizer'),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('roundNumber', t.round_number, 'playDate', t.play_date, 'courseName', t.course_name,
        'played', t.play_date is not null and t.play_date <= current_date,
        'mySubmitted', exists (select 1 from scorecard_submissions s where s.golf_trip_round_id = t.id and s.golfer_profile_id = p_profile),
        'myReopened', exists (select 1 from scorecard_submissions s where s.golf_trip_round_id = t.id and s.golfer_profile_id = p_profile and s.reopened_at is not null))
        order by t.round_number) from golf_trip_rounds t where t.golf_trip_id = p_trip), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(correction_request_view(p_profile, r) order by r.requested_at desc)
      from scorecard_correction_requests r join scoring_groups g on g.id = r.group_id
      where g.golf_trip_id = p_trip and can_view_scorecard_corrections(r.group_id, r.golfer_profile_id, p_profile)), '[]'::jsonb));
end;
$$;

-- submit_trip_scorecard, Step 6: the same checks as Step 5; a reopened card can be submitted again (new revision).
create or replace function public.submit_trip_scorecard(p_profile uuid, p_group uuid, p_golfer uuid, p_card_version integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group scoring_groups;
  v_player scoring_group_players;
  v_existing scorecard_submissions;
  v_round_number integer;
  v_holes integer[];
  v_version integer;
  v_card jsonb;
  v_revision integer;
  v_request uuid;
  v_correction scorecard_correction_requests;
begin
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  if p_profile <> p_golfer then raise exception 'You can only submit your own card.' using errcode = '42501'; end if;
  select r.round_number into v_round_number from golf_trip_rounds r where r.id = v_group.golf_trip_round_id;
  select * into v_player from scoring_group_players where group_id = p_group and profile_id = p_golfer;

  select * into v_existing from scorecard_submissions where group_id = p_group and golfer_profile_id = p_golfer;
  if v_existing.id is not null and v_existing.reopened_at is null then
    return jsonb_build_object('status', 'already-submitted', 'submittedAt', v_existing.submitted_at,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;
  if v_player.attester_profile_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'no-attester', 'holes', '[]'::jsonb,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  select coalesce(array_agg(h order by h), '{}') into v_holes from generate_series(1, 18) h
    where not exists (select 1 from hole_score_entries e where e.group_id = p_group and e.scored_profile_id = p_golfer
      and e.entered_by_profile_id = p_golfer and e.hole = h and e.strokes is not null and e.putts is not null and e.fairway is not null and e.green is not null);
  if cardinality(v_holes) > 0 then
    return jsonb_build_object('status', 'rejected', 'reason', 'incomplete', 'holes', to_jsonb(v_holes),
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  -- A reopened card: every approved hole needs a fresh attestation, saved by the attester for THIS request (the
  -- trigger's stamp). A number left over from before the approval doesn't count, even if it matches. Checked before the
  -- match, so the golfer is told "waiting for your attester" rather than "doesn't match".
  if v_existing.id is not null then
    select * into v_correction from scorecard_correction_requests
      where group_id = p_group and golfer_profile_id = p_golfer and status = 'approved';
    if v_correction.id is null then raise exception 'This card has no approved correction.' using errcode = '22023'; end if;
    select coalesce(array_agg(h order by h), '{}') into v_holes from unnest(v_correction.holes) h
      where not exists (select 1 from hole_score_entries a where a.group_id = p_group and a.scored_profile_id = p_golfer
        and a.entered_by_profile_id = v_player.attester_profile_id and a.hole = h and a.strokes is not null and a.correction_request_id = v_correction.id);
    if cardinality(v_holes) > 0 then
      return jsonb_build_object('status', 'rejected', 'reason', 'unattested', 'holes', to_jsonb(v_holes),
        'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
    end if;
  end if;

  select coalesce(array_agg(h order by h), '{}') into v_holes from generate_series(1, 18) h
    where (select e.strokes from hole_score_entries e where e.group_id = p_group and e.scored_profile_id = p_golfer and e.entered_by_profile_id = p_golfer and e.hole = h)
      is distinct from
          (select a.strokes from hole_score_entries a where a.group_id = p_group and a.scored_profile_id = p_golfer and a.entered_by_profile_id = v_player.attester_profile_id and a.hole = h);
  if cardinality(v_holes) > 0 then
    return jsonb_build_object('status', 'rejected', 'reason', 'mismatch', 'holes', to_jsonb(v_holes),
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  select coalesce(sum(e.version), 0) into v_version from hole_score_entries e
    where e.group_id = p_group and e.scored_profile_id = p_golfer and e.entered_by_profile_id in (p_golfer, v_player.attester_profile_id);
  if v_version is distinct from p_card_version then
    return jsonb_build_object('status', 'rejected', 'reason', 'stale', 'holes', '[]'::jsonb,
      'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
  end if;

  select jsonb_agg(jsonb_build_object('hole', e.hole, 'strokes', e.strokes, 'putts', e.putts, 'fairway', e.fairway, 'green', e.green,
      'penaltyFairway', e.penalty_fairway, 'penaltyGreen', e.penalty_green,
      'attestStrokes', (select a.strokes from hole_score_entries a where a.group_id = p_group and a.scored_profile_id = p_golfer
        and a.entered_by_profile_id = v_player.attester_profile_id and a.hole = e.hole)) order by e.hole)
    into v_card from hole_score_entries e
    where e.group_id = p_group and e.scored_profile_id = p_golfer and e.entered_by_profile_id = p_golfer;

  if v_existing.id is null then
    v_revision := 1;
    insert into scorecard_submissions (group_id, golfer_profile_id, golf_trip_id, golf_trip_round_id, submitted_by, card_version, card, revision)
    values (p_group, p_golfer, v_group.golf_trip_id, v_group.golf_trip_round_id, p_profile, v_version, v_card, 1)
    returning * into v_existing;
  else
    -- A reopened card: the next revision becomes current, answering the approved request.
    v_revision := v_existing.revision + 1;
    v_request := v_correction.id;
    update scorecard_submissions set revision = v_revision, reopened_at = null, submitted_at = now(), submitted_by = p_profile,
      card_version = v_version, card = v_card
    where id = v_existing.id returning * into v_existing;
    update scorecard_correction_requests set status = 'resubmitted', resubmitted_at = now() where id = v_request;
  end if;
  insert into scorecard_submission_revisions (group_id, golfer_profile_id, revision, submitted_at, submitted_by, card_version, card, correction_request_id)
  values (p_group, p_golfer, v_revision, v_existing.submitted_at, p_profile, v_version, v_card, v_request);
  update scoring_group_players set submitted_at = v_existing.submitted_at where group_id = p_group and profile_id = p_golfer;
  return jsonb_build_object('status', 'submitted', 'submittedAt', v_existing.submitted_at, 'revision', v_revision,
    'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
end;
$$;

-- save_hole_score_ops (golf_trip_scoring_offline.sql), Step 6: the same, plus while the scored golfer's correction is
-- approved:
--   * an op for a hole outside it is answered "locked" (the phone keeps it and stops sending it), never applied;
--   * the attester's op for an approved hole must carry correctionRequestId = that request (the phone adds it only to an
--     entry made after the approval). Anything else (queued before the approval, or resent with Keep mine) is answered
--     "locked" too, so an old attestation can never become the fresh one. A carried id is proposed as the stamp.
-- Approved holes otherwise behave as before (stale bases conflict). Outside a correction nothing changes.
create or replace function public.save_hole_score_ops(p_profile uuid, p_group uuid, p_scored uuid, p_ops jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group scoring_groups;
  v_scored scoring_group_players;
  v_own boolean;
  v_op jsonb;
  v_entry jsonb;
  v_hole integer;
  v_op_id uuid;
  v_row hole_score_entries;
  v_results jsonb := '[]'::jsonb;
  v_round_number integer;
  v_correction scorecard_correction_requests;
begin
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  select * into v_scored from scoring_group_players where group_id = p_group and profile_id = p_scored;
  if v_scored.profile_id is null then raise exception 'That golfer isn''t in your group.' using errcode = '42501'; end if;
  v_own := p_profile = p_scored;
  if not v_own and v_scored.attester_profile_id is distinct from p_profile then
    raise exception 'You can only score yourself and the golfer you attest.' using errcode = '42501';
  end if;
  if v_scored.submitted_at is not null then raise exception 'That card is already submitted.' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) not between 1 and 18 then
    raise exception 'Send 1 to 18 holes.' using errcode = '22023';
  end if;
  select * into v_correction from scorecard_correction_requests where group_id = p_group and golfer_profile_id = p_scored and status = 'approved';

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_entry := v_op->'entry';
    v_hole := (v_entry->>'hole')::integer;
    v_op_id := (v_op->>'opId')::uuid;
    if v_hole is null or v_hole not between 1 and 18 or v_op_id is null then
      raise exception 'Check the hole scores.' using errcode = '22023';
    end if;
    if not v_own and (v_entry->>'putts' is not null or v_entry->>'fairway' is not null or v_entry->>'green' is not null
                      or coalesce((v_entry->>'penaltyFairway')::boolean, false) or coalesce((v_entry->>'penaltyGreen')::boolean, false)) then
      raise exception 'An attester enters strokes only.' using errcode = '22023';
    end if;

    select * into v_row from hole_score_entries
      where group_id = p_group and scored_profile_id = p_scored and entered_by_profile_id = p_profile and hole = v_hole for update;

    if v_row.id is not null and v_row.last_op_id = v_op_id then
      -- A retry of an op already applied.
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'duplicate', 'version', v_row.version);
    elsif v_correction.id is not null and not (v_hole = any (v_correction.holes)) then
      -- Step 6: this hole isn't part of the approved correction; it stays as submitted.
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'locked', 'version', coalesce(v_row.version, 0));
    elsif v_correction.id is not null and not v_own and lower(coalesce(v_op->>'correctionRequestId', '')) <> v_correction.id::text then
      -- Step 6: not an attestation made for this correction (e.g. queued before it was approved): never the fresh one.
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'locked', 'version', coalesce(v_row.version, 0));
    elsif coalesce(v_row.version, 0) <> coalesce((v_op->>'baseVersion')::integer, 0)
          and not (v_row.last_op_id is not null and v_row.last_op_id::text in (select jsonb_array_elements_text(coalesce(v_op->'supersedes', '[]'::jsonb)))) then
      -- The saved score moved on since this phone last saw it: keep it, report what's saved.
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'conflict', 'version', coalesce(v_row.version, 0),
        'server', jsonb_build_object('hole', v_hole, 'strokes', v_row.strokes, 'putts', v_row.putts, 'fairway', v_row.fairway, 'green', v_row.green,
          'penaltyFairway', coalesce(v_row.penalty_fairway, false), 'penaltyGreen', coalesce(v_row.penalty_green, false)));
    else
      insert into hole_score_entries (group_id, scored_profile_id, entered_by_profile_id, hole, strokes, putts, fairway, green,
        penalty_fairway, penalty_green, client_updated_at, last_op_id, correction_request_id)
      values (p_group, p_scored, p_profile, v_hole, (v_entry->>'strokes')::integer, (v_entry->>'putts')::integer,
        v_entry->>'fairway', v_entry->>'green', coalesce((v_entry->>'penaltyFairway')::boolean, false),
        coalesce((v_entry->>'penaltyGreen')::boolean, false), coalesce((v_op->>'clientUpdatedAt')::timestamptz, now()), v_op_id,
        case when not v_own then v_correction.id end)
      on conflict (group_id, scored_profile_id, entered_by_profile_id, hole) do update set
        strokes = excluded.strokes, putts = excluded.putts, fairway = excluded.fairway, green = excluded.green,
        penalty_fairway = excluded.penalty_fairway, penalty_green = excluded.penalty_green,
        client_updated_at = excluded.client_updated_at, last_op_id = excluded.last_op_id,
        correction_request_id = excluded.correction_request_id,
        version = hole_score_entries.version + 1, updated_at = now()
      returning * into v_row;
      v_results := v_results || jsonb_build_object('opId', v_op_id, 'status', 'applied', 'version', v_row.version);
    end if;
  end loop;

  update scoring_groups set assignments_locked_at = coalesce(assignments_locked_at, now()) where id = p_group;
  select r.round_number into v_round_number from golf_trip_rounds r where r.id = v_group.golf_trip_round_id;
  return jsonb_build_object('results', v_results, 'scoring', get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number));
end;
$$;

-- save_hole_scores (golf_trip_scoring.sql), Step 6: the same, but refused for a card under an approved correction. It
-- has no versions, so it can't tell a fresh write from one delayed since before the card was locked; corrections go
-- through save_hole_score_ops only.
create or replace function public.save_hole_scores(p_profile uuid, p_group uuid, p_scored uuid, p_client_updated_at timestamptz, p_entries jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_group scoring_groups;
  v_scored scoring_group_players;
  v_own boolean;
  v_entry jsonb;
  v_round_number integer;
begin
  select * into v_group from scoring_groups where id = p_group for update;
  if v_group.id is null or not is_scoring_group_player(p_group, p_profile) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;
  select * into v_scored from scoring_group_players where group_id = p_group and profile_id = p_scored;
  if v_scored.profile_id is null then raise exception 'That golfer isn''t in your group.' using errcode = '42501'; end if;
  v_own := p_profile = p_scored;
  if not v_own and v_scored.attester_profile_id is distinct from p_profile then
    raise exception 'You can only score yourself and the golfer you attest.' using errcode = '42501';
  end if;
  if v_scored.submitted_at is not null then raise exception 'That card is already submitted.' using errcode = '42501'; end if;
  if exists (select 1 from scorecard_correction_requests where group_id = p_group and golfer_profile_id = p_scored and status = 'approved') then
    raise exception 'This card is being corrected. Refresh the page to keep scoring.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) not between 1 and 18 then
    raise exception 'Send 1 to 18 holes.' using errcode = '22023';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if not v_own and (v_entry->>'putts' is not null or v_entry->>'fairway' is not null or v_entry->>'green' is not null
                      or coalesce((v_entry->>'penaltyFairway')::boolean, false) or coalesce((v_entry->>'penaltyGreen')::boolean, false)) then
      raise exception 'An attester enters strokes only.' using errcode = '22023';
    end if;
    insert into hole_score_entries (group_id, scored_profile_id, entered_by_profile_id, hole, strokes, putts, fairway, green,
      penalty_fairway, penalty_green, client_updated_at)
    values (p_group, p_scored, p_profile, (v_entry->>'hole')::integer, (v_entry->>'strokes')::integer, (v_entry->>'putts')::integer,
      v_entry->>'fairway', v_entry->>'green', coalesce((v_entry->>'penaltyFairway')::boolean, false),
      coalesce((v_entry->>'penaltyGreen')::boolean, false), p_client_updated_at)
    on conflict (group_id, scored_profile_id, entered_by_profile_id, hole) do update set
      strokes = excluded.strokes, putts = excluded.putts, fairway = excluded.fairway, green = excluded.green,
      penalty_fairway = excluded.penalty_fairway, penalty_green = excluded.penalty_green,
      client_updated_at = excluded.client_updated_at, version = hole_score_entries.version + 1, updated_at = now()
    where hole_score_entries.client_updated_at <= excluded.client_updated_at;
  end loop;

  update scoring_groups set assignments_locked_at = coalesce(assignments_locked_at, now()) where id = p_group;
  select r.round_number into v_round_number from golf_trip_rounds r where r.id = v_group.golf_trip_round_id;
  return get_trip_round_scoring(p_profile, v_group.golf_trip_id, v_round_number);
end;
$$;

-- Live sync: phones hear about requests and decisions too.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scorecard_correction_requests') then
    alter publication supabase_realtime add table public.scorecard_correction_requests;
  end if;
end $$;

revoke all on function public.correction_request_json(public.scorecard_correction_requests) from public, anon, authenticated;
revoke all on function public.request_scorecard_correction(uuid, uuid, uuid, integer[], text) from public, anon, authenticated;
revoke all on function public.decide_scorecard_correction(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.get_scorecard_corrections(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.submit_trip_scorecard(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.save_hole_score_ops(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_hole_scores(uuid, uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.can_decide_scorecard_correction(uuid, public.scorecard_correction_requests) from public, anon, authenticated;
revoke all on function public.hole_score_entries_correction_guard() from public, anon, authenticated;
revoke all on function public.correction_request_view(uuid, public.scorecard_correction_requests) from public, anon, authenticated;
revoke all on function public.submission_revision_view(public.scorecard_submission_revisions, uuid) from public, anon, authenticated;
revoke all on function public.list_trip_corrections(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_trip_corrections(uuid, uuid) to service_role;
grant execute on function public.save_hole_score_ops(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.save_hole_scores(uuid, uuid, uuid, timestamptz, jsonb) to service_role;
grant execute on function public.request_scorecard_correction(uuid, uuid, uuid, integer[], text) to service_role;
grant execute on function public.decide_scorecard_correction(uuid, uuid, boolean, text) to service_role;
grant execute on function public.get_scorecard_corrections(uuid, uuid, integer) to service_role;
grant execute on function public.submit_trip_scorecard(uuid, uuid, uuid, integer) to service_role;

commit;
