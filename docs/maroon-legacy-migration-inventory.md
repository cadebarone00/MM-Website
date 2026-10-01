# Maroon Masters → Platform: Legacy Inventory & Migration Matrix

Status: **Phase 1 (inventory) only — awaiting owner approval.** Read-only review of the repo on 2026-09-30 (`main` @ `fd7c65a`). No code, SQL, data or routes were changed. Production database state was not queried; "in prod" facts come from `project_specs.md`, `CHANGELOG.md` and the migration checklist.

Naming note: the code already calls this tournament **"The Maroon Tournament"** (rebrand 2026-09-29). Its platform slug is **`the-maroon-tournament`**, not `maroon-masters`. See Decision D1.

---

## 1. Legacy feature inventory

| # | Feature | What it does today | Main code |
|---|---|---|---|
| F1 | Tournament identity & editions | 2024 Pinehurst, 2025 Danzante, 2026 Palm Springs (static), 2027 upcoming, 2028–2033 live-capable, 2034 = test season | `lib/data/index.ts`, `lib/data/202x-*.ts`, `lib/data/seasonCatalog.ts`, `lib/live/seasonYears.ts`, `season_calendar` |
| F2 | Season calendar / active season | Which year is "live", archive handoff dates (hard-coded `America/Chicago`) | `season_calendar`, `live_active_season`, `lib/live/activeSeason.ts`, `lib/live/seasonCalendarServer.ts` |
| F3 | Players | 13 hand-written player files + DB-only players; slug = identity; `full_name` override | `lib/data/players/*`, `player_slots`, `lib/portal/allPlayers.ts` |
| F4 | Teams & rosters | Hard-coded Maroon vs White, 6 v 6, roster lock | `live_roster`, `live_roster_assignment_locks`, `lib/data/confirmedRoster*.ts`, `/portal/admin/master-settings/[year]/players-teams` |
| F5 | Courses | Global course library (tees, rating/slope, holes, photos, location) + per-year venue files | `live_courses`, `lib/data/202x-venue.ts`, `lib/data/canonicalCourse.ts`, `coursePhotos.json` |
| F6 | Rounds / sessions / format | 6–10 sessions, Fourball/Foursome/Singles, tee times, session lock | `live_tournament_settings`, `live_round_state`, `round_format_setups`, `lib/data/roundFormatSetups.ts` |
| F7 | Matchups / pairings | Matches per session (`maroon_players` / `white_players` arrays, box ≤ 6) | `live_match_boxes`, `/portal/admin/master-settings/[year]/matchups` |
| F8 | Live hole scoring | Dual-entry per hole, atomic/idempotent submission, receipts, audit log | `live_hole_scores`, `live_hole_submissions`, `live_submission_receipts`, `live_score_audit_events`, `submit_live_hole_reliable`, `/portal/scoring/play` |
| F9 | Match state & team points | Up/down, dormie, clinch ("3&2"), official state, publication jobs, 1 / ½ points | `lib/live/scoring.ts`, `orchestration.ts`, `officialMatchState.ts`, `live_match_official_state`, `live_publication_jobs`, `publish_match_revision`, `close_live_match_atomic` |
| F10 | Round lifecycle | Begin Round / Submit Round, `start_live_round_atomic`, `submit_live_round` (round-lifecycle Phase 1 spec; partly built) | `supabase/live_round_submission.sql`, `lib/live/roundStatus.ts` |
| F11 | Leaderboards (public) | Team + individual leaderboard, projected, match detail, player page | `/leaderboard/*`, `lib/leaderboard/*`; **live year reads Google Sheet `LIVE_FEED_URL`** (`lib/data/fetchLiveTournament.ts`, `/api/live-feed`) |
| F12 | Scorecards | Historical static scorecards + DB archive; host scorecard editor; shot directions | `lib/data/scorecards-202x.ts`, `archived_scorecard_*`, `/portal/admin/scorecards/*` |
| F13 | Historical results & career stats | 2024–26 results, career archive, partnerships, buckets | `lib/data/careerArchive*.ts`, `career_*` tables, `/history`, `/teams/stats`, `/portal/career` |
| F14 | Player profiles / bios | Bio fields, moderated edits, overrides | `player_profile_edits`, `player_profile_overrides`, `/teams/[slug]/[player]`, `/portal/profile` |
| F15 | Handicap tracker | WHS engine, personal rounds (global, not per-tournament on purpose) | `lib/handicap/*`, `handicap_rounds`, `/portal/handicap` |
| F16 | Fantasy | Draft picks per round, fantasy leaderboard | `/fantasy`, `/my-team`, `lib/fantasy/*`, `fantasy_teams` (**no CREATE TABLE in repo**) |
| F17 | Wagers / MM Coins | Accounts, bets, futures (team winner, birdies, doubles, low individual, hole-in-one), settlement | `/wagers/*`, `/api/wagers/*`, `lib/wagers/*`, `wagers_accounts`, `mm_coin_bets`, `wager_types`, `*_odds_snapshots` |
| F18 | Odds model | Match/futures pricing, model runs | `lib/odds/*`, `odds_model_*`, `live_match_odds_snapshots`, `/portal/admin/odds-model` |
| F19 | Broadcast / Watch Live | Scene rotation, overlays, announcements, countdown, playlist, player-video queue | `/broadcast`, `/watch-live`, `lib/broadcast/*`, `broadcast_*` tables, `/portal/admin/broadcast-controls` |
| F20 | Shot video / round video / highlights | R2 presigned uploads, shot clips per hole, round video pages, hype video | `lib/r2`, `archived_shot_videos`, `/portal/round-video/*`, `/videos/hype-1`, `/api/instagram-reels` |
| F21 | Skins | Skins calc & payouts | `lib/skins/*`, `/portal/skins` |
| F22 | Admin Center | Master settings per year, courses, matchups, sessions, closeout, scorecards, wagers, website settings, career import, players, test season reset | `/portal/admin/*`, `/api/portal/admin/*`, `requireHost()` (`profiles.is_host`) |
| F23 | Player portal | Scoring, handicap, profile, career, skins, round video, player lookup | `/portal/*`, `requirePlayer()` |
| F24 | Website section controls | Which year each public section shows | `website_section_settings`, `lib/website/*` |
| F25 | Legacy public site | Old Maroon home/dashboard, schedule, teams, players, history, sponsorship, merch, vault | `/website`, `/schedule/*`, `/teams/*`, `/players`, `/history`, etc. |
| F26 | Google Sheet / Apps Script | Live feed + one-way backup | `appscript/live-feed.gs`, `write-scores.gs`, `LIVE_FEED_URL` |
| F27 | Auth | Supabase Auth, signup claims a player slot by `MM`+name username, invites | `/api/auth/*`, `player_slots`, `profiles` |

## 2. Legacy route inventory

**User-facing (legacy Maroon):**
`/website` (old home) · `/leaderboard`, `/leaderboard/[slug]`, `/[slug]/projected`, `/[slug]/matches/[matchId]`, `/[slug]/players/[player]` · `/teams`, `/teams/[slug]`, `/teams/[slug]/[player]`, `/teams/stats`, `/teams/stats/players/[player]` · `/schedule`, `/schedule/[slug]` · `/players` · `/history` · `/fantasy`, `/my-team` · `/wagers`, `/wagers/matches/[id]`, `/wagers/props/[id]`, `/wagers/players/[player]`, `/wagers/portfolio`, `/wagers/team-futures/team-winner`, `/wagers/player-futures/tournament-winner` · `/watch-live` · `/broadcast` · `/videos/hype-1` · `/vault`, `/merchandise`, `/sponsorship`, `/contact`, `/settings`

**Player portal:** `/portal`, `/portal/scoring`, `/portal/scoring/play`, `/portal/handicap`, `/portal/handicap/new`, `/portal/profile`, `/portal/career`, `/portal/skins`, `/portal/round-video`, `/portal/round-video/[tournament]/[round]`, `/portal/player-lookup`

**Admin Center:** `/portal/admin`, `/master-settings/[year]` (+ `/players-teams`, `/courses-format`, `/matchups`), `/players`, `/course-library`, `/course-library/[courseId]`, `/scorecards/...`, `/scoring-preview` (+ `/mobile`), `/broadcast-controls`, `/wagers`, `/wager-types`, `/odds-model`, `/career-stats`, `/website-settings`, `/website-editor`

**Legacy APIs:** `/api/live-feed`, `/api/live/*`, `/api/season-feed`, `/api/season-catalog`, `/api/confirmed-roster`, `/api/home-team-rosters`, `/api/upcoming-round-schedule`, `/api/countdown`, `/api/players/*`, `/api/player-archive-stats`, `/api/broadcast/*`, `/api/fantasy/*`, `/api/wagers/*`, `/api/portal/*` (scoring, score, handicap, profile), `/api/portal/admin/*` (≈45 routes), `/api/instagram-reels`

**Editorial (not tournament, out of scope):** `/the-maroon/*`

**New platform (already built, not legacy):** `/` (Explore), `/tournaments/join` (Tourneys), `/tournaments` (organizer studio list), `/tournaments/new`, `/tournaments/[t]/[y]` (+ preview), `/tournaments/request-access`, `/admin/tournament-access`, `/t/[t]/[y]/...` (public site), `/play/[t]/[y]/{matches,leaderboard,players,more}`, `/profile`, `/dev/play` (fixture demo), `/api/platform/*`

## 3. Data-source inventory

| Source | Holds | Notes |
|---|---|---|
| Static TS (`lib/data/*`) | 2024–26 tournaments, matches, scorecards, venues, stats, 13 player bios, 2027 upcoming | Read-only archive; owner decision §17.3: stays static in V1 |
| Generated archive (`careerArchive.generated.ts`) | Career archive | Built by `npm run build:career-archive` |
| Supabase `live_*` (30 year-keyed tables) | 2027+ settings, roster, rounds, matches, holes, submissions, official state, publication | Keyed by `season_year`; `edition_id` tag exists only if C2 is run |
| Supabase archive (`archived_scorecard_*`, `career_*`) | DB copy of history + live→archive mirror | Trigger `mirror_live_score_to_career_archive` |
| Supabase identity (`profiles`, `player_slots`, profile edits/overrides) | Accounts, player claims, bios | `is_host` global flag |
| Supabase wagers/odds/broadcast/fantasy tables | Maroon-only features | `fantasy_teams` schema not in repo |
| Supabase platform tables (C1+) | `tournaments`, `tournament_editions`, `tournament_players`, `edition_teams`, `edition_roster`, `edition_settings`, … | Seed already maps Maroon (slug `the-maroon-tournament`, editions 2024–2034, Maroon/White teams, players from `player_slots`, rosters from `live_roster`). **C1/C2 not confirmed run in prod.** |
| Google Sheet (`LIVE_FEED_URL`) | Live-year public leaderboard/matches feed | Second source of truth vs Supabase live scoring |
| Cloudflare R2 | Shot videos, playlist, round videos | Presigned upload → confirm |
| Excel workbooks (repo root) | Original 2024–27 source data | Inputs to import scripts |

SQL functions (legacy engine): `submit_live_hole(_reliable)`, `start_live_round_atomic`, `submit_live_round`, `publish_match_revision`, `queue_live_publication`, `close_live_match_atomic`, `archive_locked_round_setup`, `guard_locked_session_count`, `keep_archive_round_status`, `mirror_live_score_to_career_archive`, `sync_season_calendar`, `save_season_calendar`, `save_archived_scorecard_atomic`, `save_handicap_round_atomic`, `approve_profile_edit`, `place_mm_coin_bet`, `settle_mm_coin_market`, `settle_*_if_final` (6), `live_official_state_settle_team_winner`, `claim_team_winner_pricing`, `ensure_wagers_account`.

## 4. New-platform destination mapping

The generic contract the new screens already consume is **`TournamentSiteData`** (`components/platform/tournament-site/types.ts`) wrapped in **`TournamentHome`** (`lib/platform/tournamentHome.ts`). The legacy side already has one function that builds a full tournament for any year from static *or* live data: **`getSeasonTournament(year)`** (`lib/data/seasonCatalog.ts`). The recommended bridge is a read-only **Maroon adapter**: legacy `Tournament` → `TournamentSiteData`, used only when the slug is the legacy tournament. Nothing in the old code changes; the adapter only calls it.

| Legacy | New destination |
|---|---|
| Tournament + years | `tournaments` (`is_legacy`) + `tournament_editions` (seeded) |
| Players | `tournament_players` (`legacy_player_slug`) → `TournamentSiteData.players` |
| Teams / roster | `edition_teams` + `edition_roster` → `teams`, `players[].teamId` |
| Courses / venue | `edition_courses` (future link to `live_courses`) → `courses` |
| Rounds / sessions | `edition_rounds` → `days[].sessions` |
| Matches / pairings | `TournamentSiteData.matches` (sideA/sideB) + `TournamentHome.matchSessions` |
| Team points | `teams[].points` |
| Individual leaderboard | `standings` |
| Final result | `results` |
| Activity / announcements | `tournament_activity` (Maroon currently refused by the activity functions) |
| Scorecards, career, handicap, fantasy, wagers, broadcast, media | No `/play` destination yet — **More** tab links out to legacy pages first |

## 5. Migration matrix

Status key: **NM** = not migrated · **P** = partly · **Adapter-ready** = data exists via a legacy reader, no new storage needed. Cutover = No for every row today.

| Legacy feature | Legacy source | New destination | Status | Dependencies | Validation required | Cutover |
|---|---|---|---|---|---|---|
| Tournament identity | static + `season_calendar` | `tournaments` row (seeded) | P (seed written, prod unconfirmed) | C1 in prod; D1 slug decision | Name/slug/branding render in `/play` | No |
| Editions 2024–2033 | `lib/data`, `SEASON_YEARS` | `tournament_editions` (seeded, 2034 `is_test`) | P | C1 in prod | Year list matches `getSeasonCatalog` | No |
| Players | `lib/data/players`, `player_slots` | `tournament_players` → `players` | P (seed uses title-cased slug fallback, TD #15) | C1; name resolution via `resolvePlayer` | Every name matches legacy pages | No |
| Teams Maroon/White | hard-coded | `edition_teams` → `teams` | P | C1 | Colors/names match | No |
| Rosters | `live_roster`, static `roster` | `edition_roster` → `teamId` | Adapter-ready | none for adapter path | Roster per year = legacy `/teams/[slug]` | No |
| Courses / venue | `live_courses`, venue files | `courses` | Adapter-ready | — | Course list per year | No |
| Schedule / rounds | `live_round_state`, `round_format_setups`, static `dayDates` | `days[].sessions` | Adapter-ready | Preserve 2025 "Round INDI"/round 0, 2026 renumbering | Matches `/schedule/[slug]` | No |
| Historical results 2024–26 | static TS | `matches`, `teams[].points`, `standings`, `results` | Adapter-ready | — | Points/standings identical to `/leaderboard/[slug]`; `archiveOnlyMatches` must stay hidden | No |
| Live-year pairings (read) | `live_match_boxes` via `getSeasonTournament` | `matches`, `matchSessions`, `yourMatch` | Adapter-ready (Maroon only) | editionScope already allows Maroon | Same as Admin matchups | No |
| Live match status / points (read) | DB snapshot **and** Google Sheet | `matches[].status/progress/result`, `points` | NM | D3: which source is truth | Side-by-side compare during an event | No |
| Live individual leaderboard (read) | same as above | `standings` | NM | D3 | Compare | No |
| Live hole scoring (write) | `submit_live_hole_reliable` | future edition-keyed engine | NM | **C4** | Parallel run, identical outputs | No |
| Round lifecycle | `start_live_round_atomic`, `submit_live_round` | future edition-keyed | NM | C4; round-lifecycle build | Parallel run | No |
| Official state / closeout | `close_live_match_atomic`, publication | future | NM | C4 | Parallel run | No |
| Scorecards | static + `archived_scorecard_*` | none yet (link out) | NM | Generic scorecard view | Hole-by-hole identical | No |
| Career / history stats | `career_*`, generated archive | none yet (link out) | NM | Golfer profile design (§13) | Totals identical | No |
| Player bios | static + overrides | `players` (name only today) | NM | Bio field model | Field-by-field | No |
| Handicaps | `handicap_rounds` (global) | stays global; `players[].handicap` with consent | NM | Public-handicap consent (TD #38) | Index matches | No |
| Activity / announcements | none for Maroon | `tournament_activity` | NM | Functions refuse legacy today; needs approved change | Feed visibility tests | No |
| Fantasy | `fantasy_teams`, `lib/fantasy` | entitlement-gated link from More | NM | Schema of `fantasy_teams` unknown | — | No |
| Wagers / MM Coins | wagers tables, settle fns | entitlement-gated link from More | NM | C4 + market keys stay year-based | Balances/settlements identical | No |
| Odds model | odds tables | — | NM | C4 | — | No |
| Broadcast | `broadcast_*`, `broadcast_display_year` | link from More | NM | C4 pointer tables per tournament | — | No |
| Shot/round video, highlights | R2, `archived_shot_videos` | future `edition_media` | NM | Media model | — | No |
| Skins | `lib/skins` | — | NM | — | — | No |
| Admin Center | `/portal/admin`, `is_host` | Tournament Studio (`/tournaments/[t]/[y]`) — currently refuses Maroon | NM | C6 roles (`requireTournamentRole`) | Every admin action reproduced | No |
| Player portal | `/portal/*` | `/play` + Profile | NM | C4 | — | No |
| Website section controls | `website_section_settings` | `edition_settings.site` | NM | C4 pointer tables | — | No |
| Google Sheet feed | Apps Script | retire (backup only) | NM | D3 | — | No |
| My Tournaments entry | none | Tourneys → My Tournaments → `/play/<slug>/<year>` | P (spec drafted by other session, not built) | C1 + roster rows; D2 route decision | Signed-in player sees 2027 row and lands in `/play` | No |

## 6. Recommended migration order

1. **Decisions D1–D4** (below).
2. **Production prerequisites:** run C1 (`platform_foundation.sql`) via the checklist, with backup. Optionally C2. Without C1, no platform list can contain Maroon.
3. **Maroon read adapter (Phase 2):** `lib/platform/maroonAdapter.ts` (new file): legacy `Tournament` + roster/courses/rounds → `TournamentSiteData`. Unit tests compare its output to the legacy pages' numbers for 2024, 2025, 2026 and 2027.
4. **`/play` branch (Phase 3/4):** `loadTournamentHome` uses the adapter when the slug is the legacy tournament; everything else keeps the current path. Holding states wherever the adapter has no data. No change to `get_public_tournament_site`.
5. **My Tournaments entry (Phase 3):** Maroon edition rows link to `/play/<slug>/<year>` (the existing `list_my_active_editions` already includes legacy rows).
6. **More tab links** to the legacy scorecards, fantasy, wagers, broadcast pages (links only).
7. **Read-only live view** for 2027 matches/points from one agreed source, then a shadow comparison during the next event.
8. **C4 → C5 → C6**, then live scoring in `/play` run in parallel with the legacy scoring, compared, then cut over.
9. **Founding features** one at a time (Phase 6), then **cutover** (Phase 7).

## 7. Risks / blockers

1. **`/play` explicitly refuses Maroon today.** `get_public_tournament_site` filters `not t.is_legacy`, and activity/dashboard functions raise "The Maroon Tournament is managed in the Admin Center." Phase 3 needs the adapter branch (TS only) rather than changing these functions.
2. **C1/C2 not confirmed in production.** Several built rounds (My Profile, Join, Tournament Home) also wait on SQL files not yet run.
3. **Two live sources of truth.** Public `/leaderboard` reads the Google Sheet; `getSeasonTournament` reads Supabase. They can disagree mid-event.
4. **Slug/name mismatch** (D1): spec says `/play/maroon-masters/2027`; DB seed is `the-maroon-tournament`; legacy fallback slug is `YYYY-maroon-masters`; rebrand dropped "Masters".
5. **Route collision** (D2): target says Tourneys = `/tournaments`, but `/tournaments` is the organizer studio list today and Tourneys is `/tournaments/join`. The other terminal's uncommitted spec proposes `/tournaments/mine`.
6. **`/pickems` is a dead link** in the bottom nav (no route exists).
7. **Hard-coded Maroon/White** in ~75 files; adapter must map, not leak `maroon`/`white` into generic types.
8. **Historical oddities** must be preserved exactly (2025 round 0/INDI, 2024 archive-only match, 2026 renumbering).
9. **Name drift**: seeded `tournament_players.display_name` may differ from hand-written names (TD #15) — use the legacy resolver in the adapter.
10. **Handicap privacy**: legacy pages show MM Hcp publicly; platform hides handicaps by default.
11. **`fantasy_teams` has no schema in the repo** — must inspect prod before migrating fantasy.
12. **Concurrent sessions**: the other terminal is editing `project_specs.md` (Tourneys flow) and owns Tournament Home UI; theme work is paused. Coordinate before touching those files.
13. **No migration runner** — every SQL step is manual (TD #6).

## 8. Can migrate read-only immediately (no C4)

Tournament identity · edition list · rosters & teams per year · players (names) · courses/venue · schedule/rounds · full 2024–26 results, points and individual standings · 2027 pairings once posted (Maroon's edition scope already allows reads) · links from More to legacy scorecards/fantasy/wagers/broadcast · My Tournaments entry (after C1 in prod).

## 9. Must wait for C4

Any write from the new UI · live hole scoring · Begin/Submit Round · match status/points computed by a new engine · official state & closeout · scorecards entry · edition-keyed leaderboards · wager settlement · per-tournament pointer tables (active season, broadcast display year, website sections) · activity events from scoring · any second tournament using live scoring.

## 10. Should remain legacy longest

Admin Center (closeout, score edits, wager settlement, test-season reset) · wagers/MM Coins + odds model · broadcast + playlist + player-video queue · Google Sheet backup · shot/round video uploads · career-archive import tools · skins.

## Decisions (owner, 2026-09-30)

- **D1 — Slug & name:** **`the-maroon-tournament`**, "The Maroon Tournament". Its app is `/play/the-maroon-tournament/2027`, the same `<slug>/<year>` shape every created tournament uses. (Matches the C1 seed; no rename needed.)
- **D2 — Tourneys route:** Tourneys is the player-facing tournaments page. The organizer setup list (today's `/tournaments`) is only reached by tapping **Create a Tournament**. Route moves happen in a later approved round, not now.
- **D3 — Live read source:** **Supabase.** The Google Sheet is not a source for the new platform.
- **D4 — Run C1 in production:** **approved.** Owner runs it via `docs/production-migration-checklist.md` (backup first).
