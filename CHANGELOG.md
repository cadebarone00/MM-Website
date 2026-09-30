# Changelog

Platform-level changes (multi-tenant productization). Detailed history of
the founding tournament's features lives in `project_specs.md`.

## 2026-09-29 — Platform Phase A–C1: audit, spec, foundation

**What changed**
- Added `THE_MAROON_PRODUCT_SPEC.md`: full audit of the existing system,
  hard-coded assumptions, target multi-tenant model, roles, wizard
  configuration model, migration plan, and open product decisions.
- Added `supabase/platform_foundation.sql` (additive): `platform_plans`,
  `organizations`, `tournaments`, `tournament_editions`,
  `tournament_members`, `tournament_players`, `edition_teams`,
  `edition_roster`, `edition_settings`, plus `profiles.platform_role`.
  It seeds The Maroon Tournament as tenant #1 from existing data.
- Added `lib/platform/formats.ts`: a format registry (Singles, Fourball,
  Alternate Shot) that derives matches and tee times per round from team
  size instead of the hard-coded 12-player numbers.
- Added `lib/platform/tournamentConfig.ts`: the validated configuration
  contract the Create Tournament wizard will submit, plus a structure
  summary (matches, tee times, points available, points to win).

**Why:** the first step of turning The Maroon into a platform other golf
groups can use without code changes.

**Migrations:** `supabase/platform_foundation.sql`. **Not yet run in
production.** It is safe to run at any time (additive and idempotent), but
nothing reads it yet.

**Affected features:** none. No existing file was modified.

**Testing:** `npm test` shows 515/515 passing (505 existing + 10 new). New tests:
- The migration runs on top of the full production migration chain in
  PGlite, twice, and seeds correctly from existing hosts, player slots and
  2027 roster.
- The database rejects cross-tenant roster rows: a player from another
  tournament, a team from another edition, or a forged tournament id.
- Visitors (anon/authenticated) cannot read or write the new tables.
- The format registry reproduces today's hard-coded numbers exactly.
- The real 2026 edition expressed as a config reproduces its real 33
  points available / 17 to win.
- A 16-player Blue vs Gold "Texas Cup" validates with no code changes.
- Validation error paths.

`tsc --noEmit` and `eslint` are clean for the new files. `next build` was
not run because another terminal's dev server shares `.next`.

**Known limitations:** the live engine does not read any of this yet
(spec §16, steps C2+). Stroke-play-only events are not supported yet.
