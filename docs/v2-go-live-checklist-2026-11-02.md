# V2 Go-Live Checklist (2026-11-02)

**Goal:** the live app uses the new sign-up (birthday first, testers only, 13+). The old login accounts are deleted and
everyone, including the owner, signs up fresh. Maroon history (scorecards, results, archive, players) stays.

**Owner decisions (2026-11-02):** go live on the real production project; reset the user base (the old logins were tests);
testing happens through TestFlight on production. Follows the approved sequence in
`docs/account-retirement-architecture-2026-10-30.md` section 4 (Track P). The local legacy copy (Track L) is skipped
for now. The backup keeps that option open.

**Rules:** do the steps in order. Never skip the backup. Claude never runs SQL on production: you paste it, you
run it, you send the result back. Every reset script runs as a **dry run first** (ends in ROLLBACK, changes nothing).

---

## Step 1: See what the live database is missing (read-only)
- [ ] Supabase → pick the **production** project → **SQL Editor** → New query.
- [ ] Paste all of `docs/v2-go-live-preflight.sql` → **Run**. It only reads.
- [ ] Send Claude the result table. Claude turns every `false` into the exact run list for Step 6.

## Step 2: Pick a quiet time and close old sign-ups
- [ ] No live event or trip happening.
- [ ] Supabase → **Authentication → Sign In / Providers** → turn **off** "Allow new users to sign up".
      This stops anyone making an old-style account while you reset. You turn it back on in Step 7.
- [ ] Supabase → **Database → Webhooks**: switch off any that are on (note which, to restore later).

## Step 3: Back up everything (read-only on production)
Supabase's free plan keeps **no backups**. This backup is the only way back.
- [ ] Make a folder **outside** OneDrive and outside the GitHub folder, e.g. `C:\MaroonBackups`.
- [ ] Tell Claude "run the backup". Claude runs `npm run backup:database` and
      `node scripts/legacy-local/backup-storage.mjs` into that folder. These only read production.
- [ ] Claude runs `node scripts/legacy-local/verify-backup.mjs` → must say **BACKUP VERIFIED**. If not, stop here.

## Step 4: Reset the accounts (deletes the old logins)
- [ ] Run the read-only inspection `docs/database-inspection-account-reset.sql`, send Claude the result
      (Claude checks the numbers the reset will use, including any `scoring_groups.source = 'tournament'` rows).
- [ ] `docs/account-reset-part1-shared-data-DRAFT.sql`: **dry run** → send result → Claude confirms → run the COMMIT version.
- [ ] `docs/account-reset-part2-accounts-DRAFT.sql`: **dry run** → send result → Claude confirms → run the COMMIT version
      (you type the approved numbers into it).
- [ ] Supabase → **Storage** → `profile-photos` → delete all files.
- [ ] Run the inspection again: expect **0 logins** and Maroon history counts the same as before.

## Step 5: Email codes (needed or testers never get their 6-digit code)
Supabase's built-in email only sends to your own team and only a few per hour, so testers need a real sender.
- [ ] Use your email service (e.g. Resend) with your domain verified.
- [ ] Supabase → **Authentication → Emails → SMTP Settings** → turn on custom SMTP and paste the service's details.
- [ ] Supabase → **Authentication → Emails → Templates → Confirm signup**: add the line
      `Enter this code in The Maroon: <strong>{{ .Token }}</strong>` (keep the existing link too).
      Do the same in **Reset Password** so password resets show a code.

## Step 6: Install the new database files
Run each file in `supabase/` in this order, **only** where Step 1 said `false`. Exception: always run
`profile_friends.sql` and `account_activation.sql` again because both were updated (safe to re-run).
1. platform_foundation · player_slots_email · player_slots_full_name · tournament_player_identity · profile_identity ·
   profile_v1 · golf_trips · golf_trip_invitations · player_rounds · shared_rounds (older foundation)
2. `profile_initialization.sql`
3. `account_deletion.sql`
4. `profile_friends.sql` (always)
5. `profile_read_model.sql`
6. `account_activation.sql` (always)
7. `auth_code_attempts.sql`
8. `signup_gate.sql`
- [ ] **Never** run `account_activation_enforcement.sql`.
- [ ] Run Step 1's check again: every row except the "NEVER RUN" row should say `true`.

## Step 7: Turn on the sign-up gate
- [ ] Supabase → **Authentication → Hooks** → **Before User Created** → type Postgres → function
      `public.before_user_created_gate` → enable.
- [ ] Supabase → **Authentication → Sign In / Providers**: keep Google / Apple / phone / anonymous **off** for sign-up.
      Turn "Allow new users to sign up" back **on** (the gate now decides who gets in).
- [ ] SQL Editor: add yourself and each tester, then open to testers:
  ```sql
  insert into public.signup_allowlist (email_normalized, note) values (lower('you@example.com'), 'owner');
  update public.registration_settings set mode = 'testers', updated_at = now() where id;
  ```

## Step 8: Switch the live site to the new sign-up
- [ ] Vercel → the MM-Website project → **Settings → Environment Variables** → add `MAROON_V2_ONBOARDING` = `on`
      for **Production**.
- [ ] Vercel → **Deployments** → latest production deployment → **Redeploy**.

## Step 9: You sign up first, then get your admin powers back
- [ ] On the live site (or the TestFlight app): Sign up → birthday → email → code → name → finish.
- [ ] Send Claude "re-grant me". Claude prepares `docs/admin-regrant-DRAFT.sql` with your email:
      dry run first, then the real run. Repeat for each organizer (e.g. Cam) after they sign up.

## Step 10: TestFlight testers
- [ ] Add each tester's email to `signup_allowlist` (Step 7 SQL) **before** they try to sign up.
- [ ] Testers install from TestFlight and sign up. Opening to everyone later = `mode = 'open'` (separate decision).

## If something goes wrong
- Site problem → Vercel → Deployments → promote the previous deployment, or set `MAROON_V2_ONBOARDING` back to off.
- Gate problem → set `mode = 'closed'` (nobody new can sign up) and tell Claude.
- Data problem after Step 4 → stop, don't sign anyone up; restore from the Step 3 backup with Claude.
