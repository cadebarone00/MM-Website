-- supabase/tournament_documents.sql
-- Tournament PDFs (by code): the organizer uploads an Info PDF and a Pin Sheet in Tournament Settings. Each one that's
-- uploaded adds its own tab on the tournament page (Info to the left of Leaderboard, Pin Sheet after Tee Sheet).
--
-- Files live in the public-read "tournament-docs" bucket at <tournament id>/<kind>-<random>.pdf (the random part keeps a
-- private tournament's files unguessable); code_tournaments.info_pdf / pin_sheet_pdf point at the current ones.
-- Nobody uploads from the browser: the server checks the organizer, the file type (PDF) and size (10 MB), then uploads
-- with the service-role key (lib/platform/tournamentDocuments.ts, app/api/code-tournaments/[id]/documents/route.ts).
--
-- Prerequisites: tournament_codes.sql, tournament_tee_sheets.sql, tournament_cuts.sql, tournament_public.sql.
-- Safe to run more than once.
-- Undo: alter table public.code_tournaments drop column info_pdf, drop column pin_sheet_pdf;
--       drop function public.set_code_tournament_document(uuid, uuid, text, text); then re-run tournament_public.sql
--       (get_code_tournament without the PDFs), and delete the bucket in Storage.

begin;

alter table public.code_tournaments add column if not exists info_pdf text check (info_pdf is null or length(info_pdf) between 1 and 300);
alter table public.code_tournaments add column if not exists pin_sheet_pdf text check (pin_sheet_pdf is null or length(pin_sheet_pdf) between 1 and 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-docs', 'tournament-docs', true, 10485760, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Only the organizer sets (or, with null, removes) a PDF. Returns the path it replaced, so the server can delete that file.
create or replace function public.set_code_tournament_document(p_organizer uuid, p_tournament uuid, p_kind text, p_path text)
returns text language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if p_kind not in ('info', 'pinSheet') then raise exception 'That isn''t a tournament document.' using errcode = '22023'; end if;
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then raise exception 'Only the organizer can change this.' using errcode = '42501'; end if;
  if p_kind = 'info' then
    select info_pdf into v_old from code_tournaments where id = p_tournament;
    update code_tournaments set info_pdf = p_path where id = p_tournament;
  else
    select pin_sheet_pdf into v_old from code_tournaments where id = p_tournament;
    update code_tournaments set pin_sheet_pdf = p_path where id = p_tournament;
  end if;
  return v_old;
end $$;

-- As in tournament_public.sql, with the PDFs.
create or replace function public.get_code_tournament(p_profile uuid, p_tournament uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not code_tournament_is_member(p_profile, t.id) then null else jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.name, 'organizer', t.organizer, 'organizerPlays', t.organizer_plays, 'scoring', t.scoring,
    'status', t.status, 'createdAt', t.created_at, 'cut', t.cut, 'isPublic', t.is_public, 'infoPdf', t.info_pdf, 'pinSheetPdf', t.pin_sheet_pdf,
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'setup', r.setup, 'date', r.round_date, 'teeSheet', r.tee_sheet) order by r.number), '[]'::jsonb)
               from code_tournament_rounds r where r.tournament_id = t.id),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('profileId', p.profile_id, 'name', pr.display_name, 'username', pr.username, 'handicap', p.handicap) order by p.joined_at), '[]'::jsonb)
                from code_tournament_players p join profiles pr on pr.id = p.profile_id where p.tournament_id = t.id),
    'holes', (select coalesce(jsonb_agg(jsonb_build_object('profileId', h.profile_id, 'round', h.round, 'hole', h.hole, 'strokes', h.strokes)), '[]'::jsonb)
              from code_tournament_holes h where h.tournament_id = t.id),
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('profileId', c.profile_id, 'round', c.round, 'submittedAt', c.submitted_at)), '[]'::jsonb)
              from code_tournament_cards c where c.tournament_id = t.id))
  end
  from code_tournaments t where t.id = p_tournament;
$$;

revoke all on function public.set_code_tournament_document(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_code_tournament_document(uuid, uuid, text, text) to service_role;
revoke all on function public.get_code_tournament(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_code_tournament(uuid, uuid) to service_role;

commit;
