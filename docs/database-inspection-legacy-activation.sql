-- docs/database-inspection-legacy-activation.sql
-- READ-ONLY dry-run inventory for the legacy-account backfill (Pending accounts Phase 1; project_specs.md §10).
-- Works on a database that does NOT have supabase/account_activation.sql yet (it uses the same rules as
-- legacy_activation_classify() in that file). It changes nothing: the whole thing runs in a READ ONLY transaction that is
-- rolled back. Output = counts, plus account ids (uuids only) for anything that needs a person to look at it.
-- No names, emails, usernames, phone numbers or dates are printed.
--
-- Owner runs it (Supabase dashboard → SQL editor). Claude never runs SQL on a hosted project.
--
-- Categories (first match wins):
--   deleted             profiles.deleted_at set, or the account is in account_deletions (if that table exists)
--   restricted          the login is banned (auth.users.banned_until in the future) or soft-deleted (auth.users.deleted_at)
--   incomplete          username or display name missing
--   review              complete, but: no login behind it | email not verified | username breaks today's format |
--                       username duplicated (ignoring case) | profile email differs from login email |
--                       player claim inconsistent (profiles.player_slug vs player_slots.claimed_by) | pending admin player claim
--   eligible_completed  complete, verified, valid unique username, matching email, consistent claim, no flags
-- Having a name and username is NOT enough for eligible_completed. Every eligible account still has NO birthday and must
-- give one at its next login before any golf feature (no grace period).

begin transaction read only;

-- One query, one result: (section, item, accounts). Sections: category | review_reason | needs_review (uuid in item)
-- | logins_without_profile | pending_player_claims.
with base as (
  select p.id, p.username, p.display_name, p.email as profile_email, p.player_slug,
         (p.deleted_at is not null
           or (to_regclass('public.account_deletions') is not null
               and exists (select 1 from public.account_deletions d where d.account_id = p.id))) as is_deleted,
         u.id as user_id, u.email as auth_email, u.email_confirmed_at, u.banned_until, u.deleted_at as login_deleted_at
  from public.profiles p left join auth.users u on u.id = p.id
), flags as (
  select b.*,
    array_remove(array[
      case when b.user_id is null then 'no_login' end,
      case when b.user_id is not null and b.email_confirmed_at is null then 'email_unverified' end,
      case when b.username !~ '^[A-Za-z0-9][A-Za-z0-9_.]{2,29}$' then 'username_format' end,
      case when exists (select 1 from public.profiles o where o.id <> b.id and lower(o.username) = lower(b.username)) then 'username_duplicate' end,
      case when b.user_id is not null and lower(coalesce(b.profile_email, '')) <> lower(coalesce(b.auth_email, '')) then 'email_mismatch' end,
      case when (b.player_slug is not null and not exists (select 1 from public.player_slots s where s.player_slug = b.player_slug and s.claimed_by = b.id))
             or exists (select 1 from public.player_slots s where s.claimed_by = b.id and s.player_slug is distinct from b.player_slug)
           then 'player_claim_mismatch' end
    ], null) as review_reasons
  from base b
), classified as (
select id,
  case
    when is_deleted then 'deleted'
    when coalesce(banned_until > now(), false) or login_deleted_at is not null then 'restricted'
    when coalesce(btrim(username), '') = '' or coalesce(btrim(display_name), '') = '' then 'incomplete'
    when cardinality(review_reasons) > 0 then 'review'
    else 'eligible_completed'
  end as category,
  case when is_deleted or coalesce(banned_until > now(), false) or login_deleted_at is not null
         or coalesce(btrim(username), '') = '' or coalesce(btrim(display_name), '') = '' then '{}'::text[]
       else review_reasons end as reasons
from flags
)
select 'category' as section, category as item, count(*)::text as accounts from classified group by 2
union all
select 'review_reason', reason, count(*)::text from classified, unnest(reasons) reason group by 2
union all
select 'needs_review', id::text || ' ' || category || ' ' || array_to_string(reasons, ','), '1' from classified where category in ('review', 'restricted')
union all
select 'logins_without_profile', 'count', count(*)::text from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
union all
select 'pending_player_claims', case when to_regclass('public.player_claim_invitations') is null then 'table not installed' else 'installed (not counted here)' end, ''
order by 1, 2;

rollback;
