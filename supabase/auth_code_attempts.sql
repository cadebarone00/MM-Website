-- supabase/auth_code_attempts.sql
-- *** PROPOSED — APPLIED ONLY TO ISOLATED LOCAL TEST STACKS. DO NOT RUN ON A HOSTED PROJECT WITHOUT SEPARATE APPROVAL. ***
--
-- Pending accounts Phase 6: a limit on 6-digit email code guesses (sign-up verification and password-reset codes),
-- used by POST /api/auth/verify-code. Supabase already limits code checks per IP address; this adds a limit per EMAIL
-- ADDRESS, so spreading guesses over many addresses' worth of IPs doesn't help: at most 5 tries per address per kind in
-- 15 minutes. Only a SHA-256 of the lower-cased address is stored (never the address), and rows older than a day are
-- removed as new ones arrive. Service role only; browsers can't read or write it.
--
-- Prerequisites: none. Safe to run more than once.

create table if not exists public.auth_code_attempts (
  key_hash text not null,
  kind text not null check (kind in ('signup', 'recovery')),
  attempted_at timestamptz not null default now()
);
create index if not exists auth_code_attempts_key on public.auth_code_attempts (key_hash, kind, attempted_at);
alter table public.auth_code_attempts enable row level security;
revoke all on public.auth_code_attempts from public, anon, authenticated;

-- Counts this try and answers whether it may go ahead (true) or is over the limit (false). One try at a time per
-- address + kind (advisory lock), so parallel guesses can't slip past the count.
create or replace function public.claim_auth_code_attempt(p_key text, p_kind text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if p_key is null or length(p_key) <> 64 or p_kind not in ('signup', 'recovery') then
    raise exception 'Bad attempt key.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('auth_code_attempt:' || p_kind || ':' || p_key, 0));
  delete from auth_code_attempts where key_hash = p_key and kind = p_kind and attempted_at < now() - interval '1 day';
  select count(*) into v_count from auth_code_attempts
  where key_hash = p_key and kind = p_kind and attempted_at > now() - interval '15 minutes';
  if v_count >= 5 then return false; end if;
  insert into auth_code_attempts (key_hash, kind) values (p_key, p_kind);
  return true;
end;
$$;

-- A correct code clears the count for that address + kind.
create or replace function public.clear_auth_code_attempts(p_key text, p_kind text)
returns void
language sql security definer set search_path = public as $$
  delete from auth_code_attempts where key_hash = p_key and kind = p_kind;
$$;

revoke all on function public.claim_auth_code_attempt(text, text) from public, anon, authenticated;
revoke all on function public.clear_auth_code_attempts(text, text) from public, anon, authenticated;
grant execute on function public.claim_auth_code_attempt(text, text) to service_role;
grant execute on function public.clear_auth_code_attempts(text, text) to service_role;
