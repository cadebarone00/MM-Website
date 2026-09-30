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
| DASHBOARD | `supabase/platform_dashboard.sql` | Lets organizers edit, save and publish each setup section on `/tournaments/<address>/<year>` | Run `drop function public.set_edition_published(uuid, uuid, boolean); drop function public.save_tournament_section(uuid, uuid, text, jsonb); drop function public.get_tournament_setup(uuid, uuid); drop function public.can_manage_edition(uuid, uuid);` |

C2, CREATE and DASHBOARD each need C1 (none needs another). Run C1 before CREATE and DASHBOARD, since C1 also adds the planned-courses and planned-rounds tables they use. To undo C1, first
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

**Part A: download a copy of every table (works on every Supabase plan).**
1. In VS Code's terminal, in the project folder, run:
   ```
   npm run backup:production
   ```
2. Good looks like: one line per table with a row count, ending in
   `Backed up N tables to out/backups/<date-time>`.
3. If it says **BACKUP FAILED**, stop. Don't migrate. Send me the message.
4. That folder is your data backup. `out/` is never uploaded to GitHub.
   Keep the folder until the migration has been checked.

This copies data only (every row of every table), not database code such
as functions and triggers. The database code is already saved in the
`supabase/` folder in git.

**Part B: check Supabase's own backup.**
1. Go to supabase.com → your project → **Database** (left sidebar) →
   **Backups**.
2. If you see daily backups listed (paid plans), write down the time of
   the newest one. Supabase can restore the whole database to that point.
3. If the page says backups aren't available on your plan, that's OK.
   Part A is your backup. Just be aware there's no one-click restore.

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
