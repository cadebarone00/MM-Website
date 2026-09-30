# Production Migration Checklist

Follow this every time a platform SQL file (`supabase/platform_*.sql`) is
run against the real Supabase database. Do the steps in order and don't
skip any. Each step says what "good" looks like.

**Files, in run order:**

| Step | File | What it does | Undo file |
|---|---|---|---|
| C1 | `supabase/platform_foundation.sql` | Adds the new tournament/edition tables and copies The Maroon into them | `supabase/platform_foundation_rollback.sql` |
| C2 | `supabase/platform_editions.sql` | Tags every year-labeled row with its edition | `supabase/platform_editions_rollback.sql` |

| CREATE | `supabase/platform_create_tournament.sql` | Lets invited organizers save a new tournament from `/tournaments/new` | Run `drop function public.create_tournament_shell(uuid, jsonb);` |
| DASHBOARD | `supabase/platform_dashboard.sql` | Lets organizers edit, save and publish each setup section on `/tournaments/<address>/<year>` | Run `drop function public.list_managed_editions(uuid); drop function public.set_edition_published(uuid, uuid, boolean); drop function public.save_tournament_section(uuid, uuid, text, jsonb); drop function public.get_tournament_setup(uuid, uuid); drop function public.can_manage_edition(uuid, uuid);` |
| PUBLIC SITE | `supabase/platform_public_site.sql` | Serves published customer tournaments at `/t/<address>/<year>` (visitor-safe, read-only; never The Maroon's live tables) | Needs DASHBOARD too (the preview uses its `can_manage_edition`). Run `drop function public.get_tournament_site_preview(uuid, uuid); drop function public.get_public_tournament_site(text, integer, uuid); drop function public.tournament_site_projection(uuid); drop function public.get_public_tournament_years(text, uuid); drop function public.can_view_tournament(uuid, uuid);` |
| ACCESS REQUESTS | `supabase/platform_access_requests.sql` | Lets signed-in people request tournament-creator access at `/tournaments/request-access`, and platform admins approve/deny them at `/admin/tournament-access` (approval writes `tournament_creator_access`) | Run `drop function public.review_tournament_access_request(uuid, bigint, text, text); drop function public.list_tournament_access_requests(uuid); drop function public.submit_tournament_access_request(uuid, jsonb); drop function public.get_my_tournament_access(uuid); drop function public.can_create_tournament(uuid); drop table public.tournament_access_requests;` (the table holds people's requests: back it up first) |
| PAST TOURNAMENTS | `supabase/platform_past_editions.sql` | Lists the finished tournaments a signed-in person played in on `/tournaments/join` (read-only) | Run `drop function public.list_my_past_editions(uuid);` |

C2, CREATE, DASHBOARD, PUBLIC SITE, ACCESS REQUESTS and PAST TOURNAMENTS each need C1; PUBLIC SITE also needs DASHBOARD. Undo ACCESS REQUESTS before undoing C1. Run C1 before CREATE and DASHBOARD, since C1 also adds the planned-courses and planned-rounds tables they use. To undo C1, first
undo C2 and CREATE.

---

## 1. Pick a safe time
- [ ] **No live event.** No session is started and nobody is entering
      scores. The next real event is the 2027 edition (January 2027). Don't
      migrate during it.
- [ ] **No test round in progress** on the 2034 test season.
- [ ] **Nothing else is being deployed or migrated** at the same time,
      including the other terminal.
- [ ] You have 30 minutes free.

## 2. Make a backup (both parts)

**Part A: export REST-visible application rows (not a full database backup).**
1. In VS Code's terminal, in the project folder, run:
   ```
   npm run backup:production
   ```
2. Good looks like: one line per table with a row count, ending in
   `Backed up N tables to out/backups/<date-time>`.
3. If it says **BACKUP FAILED**, stop. Don't migrate. Send me the message.
4. That folder is your data backup. `out/` is never uploaded to GitHub.
   Keep the folder until the migration has been checked.

This copies only resources discovered through the REST API and accessible
to the configured key, without a shared transaction snapshot. It does not
capture database schema, functions, triggers, policies, Auth or media bytes.
SQL in `supabase/` records intended database code, not verified deployed drift.
See [Backup & Recovery](../BACKUP_RECOVERY_SPEC.md) for the coverage audit.

**Part B: check Supabase's own backup.**
1. Go to supabase.com → your project → **Database** (left sidebar) →
   **Backups**.
2. If you see daily backups listed (paid plans), write down the time of
   the newest one. Supabase can restore the whole database to that point.
3. If backups are unavailable, record the gap. Do not treat Part A as a
   full recovery substitute for a high-risk migration.

**Additional recovery gate for future high-risk migrations (including C4):**

- [ ] Fresh successful independent PostgreSQL backup, checksum verified and
      protected off-site; see `npm run backup:database` prerequisites in the spec.
- [ ] Provider backup availability and latest recovery point confirmed, or stop
      and resolve the missing protection before proceeding.
- [ ] Clean Git state and exact code/SQL revision recorded; coordinate other agents.
- [ ] Known, rehearsed restore path using [the isolated drill](restore-drill.md).
- [ ] Practice migration succeeds on an isolated restored database.
- [ ] Reviewed rollback versus restore strategy, including writes made since backup
      and impact on every live tournament. An undo script is not a data restore.

These are operational prerequisites only; migration SQL and execution semantics
are unchanged. Do not run production backup or restore automatically.

## 3. Run the migration
1. Supabase → **SQL Editor** → **New query**.
2. Open the migration file in VS Code, select all (Ctrl+A), copy, and
   paste it into the editor.
3. Click **Run**.
4. Good looks like: **"Success. No rows returned."**
5. If you see an error, don't run anything else. Every migration is one
   all-or-nothing transaction, so an error means **nothing changed**. Send
   me the error text.

## 4. Check it worked

Paste each query into a new SQL Editor query and click Run.

**After C1: the new tournament tables exist and have The Maroon in them.**
```sql
select
  (select count(*) from organizations) as organizations,
  (select count(*) from tournaments) as tournaments,
  (select count(*) from tournament_editions where tournament_id = (select id from tournaments where is_legacy)) as maroon_editions,
  (select count(*) from tournament_members where role = 'owner') as owners;
```
Good: `organizations = 1`, `tournaments = 1`, `maroon_editions = 11`,
`owners` equals the number of host accounts (at least 1).

**After C2: every year-labeled row is tagged, and no rows were lost.**
```sql
select c.table_name,
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I where season_year is not null and edition_id is null', c.table_name), false, true, '')))[1]::text::int as rows_missing_edition,
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.table_name), false, true, '')))[1]::text::int as total_rows
from information_schema.columns c
join information_schema.columns y on y.table_schema = c.table_schema and y.table_name = c.table_name and y.column_name = 'season_year'
where c.table_schema = 'public' and c.column_name = 'edition_id' and c.table_name <> 'tournament_editions'
order by 1;
```
Good: 30 rows, and **every** `rows_missing_edition` is `0`. Also compare
each `total_rows` with the same table's number in
`out/backups/<date-time>/_row-counts.json`. They must match.

**After CREATE: give yourself access.** Creating tournaments is invite-only,
so nobody can save one until you do this. Replace the email with your
account's login email.
```sql
update profiles set platform_role = 'admin' where lower(email) = lower('you@example.com');
```
To let another organizer create tournaments (safe to run again):
```sql
insert into tournament_creator_access (profile_id, status, decided_at)
select id, 'approved', now() from profiles where lower(email) = lower('them@example.com')
on conflict (profile_id) do update set status = 'approved', decided_at = now();
```
To see who can create right now:
```sql
select p.email, p.platform_role, a.status from profiles p
left join tournament_creator_access a on a.profile_id = p.id
where p.platform_role = 'admin' or a.status = 'approved' order by 1;
```
Then open `/tournaments/new` while signed in, enter a name, and click
**Create now, finish later**. You should land on
`/tournaments/<address>/<year>` with the tournament's setup page.

## 5. Check the website still works
Open the live site and confirm each of these loads the same as before:
- [ ] Home page
- [ ] Leaderboard for 2026 and 2027
- [ ] Teams and Schedule
- [ ] Portal → your scoring screen
- [ ] Admin Center → Master Settings → 2027 (Players & Teams, Courses &
      Format, Matchups)

## 6. If something is wrong
1. Don't try to fix data by hand.
2. Run the undo file for the step you just ran (see the table at the top)
   the same way as step 3. The undo files remove only what the migration
   added. The Maroon's own data is never deleted by them.
3. Run the step 4 check again to confirm it's back to how it was.
4. Send me what you saw.
