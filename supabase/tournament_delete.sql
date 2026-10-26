-- supabase/tournament_delete.sql
-- Delete a tournament (by code): Tournament Settings → Delete Tournament. Only its organizer can, and it's for everyone:
-- the tournament, its rounds, players' spots, scores, cards, attests, tee sheets and invites all go (on delete cascade).
-- Players keep their own accounts. Returns the tournament's uploaded PDF paths so the server can remove those files.
--
-- Prerequisites: tournament_codes.sql (and tournament_documents.sql for the PDFs). Safe to run more than once.
-- Undo: drop function public.delete_code_tournament(uuid, uuid);

begin;

create or replace function public.delete_code_tournament(p_organizer uuid, p_tournament uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_files jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from code_tournaments where id = p_tournament and organizer = p_organizer) then
    raise exception 'Only the organizer can delete this tournament.' using errcode = '42501';
  end if;
  -- The PDFs (tournament_documents.sql), when that's set up.
  begin
    execute 'select coalesce(jsonb_agg(p), ''[]''::jsonb) from (
      select info_pdf as p from code_tournaments where id = $1 and info_pdf is not null
      union all select pin_sheet_pdf from code_tournament_rounds where tournament_id = $1 and pin_sheet_pdf is not null) f'
    into v_files using p_tournament;
  exception when undefined_column then v_files := '[]'::jsonb;
  end;
  delete from code_tournaments where id = p_tournament;
  return v_files;
end $$;

revoke all on function public.delete_code_tournament(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_code_tournament(uuid, uuid) to service_role;

commit;
