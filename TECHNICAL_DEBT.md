# Technical Debt

Shortcuts and known problems, each with a recommended fix. Priority: P1 =
blocks the platform, P2 = fix during platform work, P3 = later.

| # | Issue | Impact | Recommended solution | Priority |
|---|---|---|---|---|
| 1 | Every `live_*`/broadcast/odds table is keyed by `season_year` alone | Two tournaments can't both have a 2027; blocks multi-tenancy | Spec §6.2: add `edition_id`, backfill, defaulting trigger, then switch keys | P1 |
| 2 | Teams are hard-coded `maroon`/`white` (types, DB check, `maroon_players`/`white_players` columns, ~75 files) | No other team names possible | Spec §6.3: team keys from `edition_teams`, sides A/B | P1 |
| 3 | `profiles.is_host` is a global "host of everything" flag | Any organizer would control every tournament | `requireTournamentRole()` backed by `tournament_members` | P1 |
| 4 | 12-player / 3-tee-time / 6–10-session / box ≤ 6 limits in code and DB checks | Different-sized events impossible | Derive from config via `lib/platform/formats.ts`; drop checks | P1 |
| 5 | `season_year between 2027 and 2034` checks; 2034 reserved as a test year | Hard ceiling on years; test data shares real tables | Drop after edition keys; model test as `tournament_editions.is_test` | P2 |
| 6 | No migration runner: SQL files are pasted by hand; `schema.sql` doesn't contain later columns | Hard to know what production has; risky for tenants | Adopt Supabase CLI migrations with a `schema_migrations` record | P2 |
| 7 | Historical 2024–2026 data is static TypeScript | Can't be edited via UI; other tenants' history must be in the DB | Import into DB tables behind the same tournament interface (after V1) | P3 |
| 8 | Player identity = global `player_slots.player_slug`; guessable `MM`+name usernames; signup can squat an un-invited slot | Security issue grows with many tenants | Tournament-scoped invitations with single-use tokens; retire username claim | P1 |
| 9 | Brand colors are fixed Tailwind tokens (`maroon-700`, …) | Tournaments can't be rebranded | Per-tournament CSS variables injected by a tournament layout | P2 |
| 10 | `sync_season_calendar()` hard-codes `America/Chicago` | Wrong handoff time for other tenants | Use the edition's timezone | P2 |
| 11 | `CLAUDE.md` "Tech Stack/Running" sections describe a Python app | Misleads future sessions | Owner to update to Next.js/Supabase | P3 |
| 12 | `middleware.ts` uses the deprecated Next 16 "middleware" convention | Future upgrade break | Move to "proxy" convention | P3 |
| 13 | Real-money wager design exists (`2026-08-05-wagers-phase3-real-money-design.md`) | Legal/regulatory exposure if offered to customers | Keep MM Coins Maroon-only behind an entitlement; legal review before any real money | P1 (policy) |
| 14 | `edition_teams.color` for Team White is cream `#fbf8f1` | Near-invisible on light backgrounds if used as text | Theme code must pick readable text color by contrast | P3 |
| 15 | Seeded `tournament_players.display_name` falls back to title-cased slug when `player_slots.full_name` is empty | May differ from hand-written names in `lib/data/players` | Backfill names from `lib/data/players` in a script when the new layer is first read | P3 |
| 16 | Until C4, keys on the 30 live tables are still year-based (`season_year`), with `edition_id` only a tag | A second tournament can't use live scoring yet (its 2027 would collide with The Maroon's) | C4: switch unique keys/FKs to `edition_id`, make it `not null`, and give SQL functions edition parameters | P1 |
| 17 | `backup:production` exports data through the REST API only (no functions, triggers or `auth` schema) | Not a full database restore by itself | Database code is in git (`supabase/`); add `pg_dump` via the Supabase CLI once a DB connection string is set up locally | P2 |
| 18 | The SQL Editor migration is manual copy-paste (see #6) | Human error risk grows with each migration | Supabase CLI migrations | P2 |
