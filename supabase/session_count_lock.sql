-- Run in Supabase SQL Editor before deploying the session-count lock UI.
alter table public.live_tournament_settings
  add column if not exists round_count_locked boolean not null default false;

-- Enforce the saved lock even for concurrent requests or direct writes.
create or replace function public.guard_locked_session_count()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.round_count_locked and new.round_count is distinct from old.round_count then
    raise exception 'Unlock the number of sessions before changing it.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_locked_session_count on public.live_tournament_settings;
create trigger guard_locked_session_count
  before update on public.live_tournament_settings
  for each row execute function public.guard_locked_session_count();
