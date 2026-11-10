-- supabase/signup_gate_birthday_after.sql
-- Sign-up order: birthday AFTER the account is made (owner decision 2026-11-02; project_specs.md "Sign-up order:
-- birthday AFTER account creation"). Replaces the birthday-first part of signup_gate.sql:
--   * The Before User Created hook keeps everything else: registration closed / testers allowlist / email-only.
--     It no longer asks for an age pass.
--   * The two age-pass triggers are removed, so every new account gives its birthday on the onboarding Birthday step
--     (set_my_birthdate: write-once, 13+). Under 13 there -> Ineligible, signed out, login + data cleaned up
--     (Pending accounts Phase 4), and the account is never activated.
--   * public.age_passes, issue_age_pass and bind_age_pass stay (unused) so nothing that still names them breaks.
--
-- Prerequisite: signup_gate.sql. Safe to run more than once. Changes no rows.
-- Undo: run signup_gate.sql again (puts the age-pass hook and both triggers back).

begin;

create or replace function public.before_user_created_gate(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user jsonb := coalesce(event -> 'user', '{}'::jsonb);
  v_email text := lower(btrim(coalesce(v_user ->> 'email', '')));
  v_provider text := coalesce(v_user -> 'app_metadata' ->> 'provider', 'email');
  v_mode text;
begin
  select mode into v_mode from registration_settings where id;
  if coalesce(v_mode, 'closed') = 'closed' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Registration is closed.'));
  end if;
  -- Beta: new accounts only by email (Apple / Google sign-up stays off).
  -- Anything but an explicit "false" counts as anonymous (refused): a malformed value can never make the hook raise.
  if coalesce(v_user ->> 'is_anonymous', 'false') <> 'false' or v_provider <> 'email' or v_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'New accounts can only be created with email.'));
  end if;
  if v_mode = 'testers' and not exists (select 1 from signup_allowlist where email_normalized = v_email) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Registration is invite-only right now.'));
  end if;
  return '{}'::jsonb;
end;
$$;
-- Supabase Auth calls hooks as supabase_auth_admin; nobody else may (same grants as signup_gate.sql).
revoke all on function public.before_user_created_gate(jsonb) from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_gate(jsonb) to supabase_auth_admin;

drop trigger if exists require_age_pass_for_profile on public.profiles;
drop trigger if exists guard_post_gate_birthdate on public.account_birthdates;

commit;
