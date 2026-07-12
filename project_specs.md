# Maroon Masters Website — Project Spec

## What the app does

A public website for "The Maroon Masters" — an annual golf trip/tournament between two
friend groups, Team Maroon and Team White. It shows the history of every edition, team
rosters, live and historical leaderboards, hole-by-hole scorecards, and (this round) a
player/course statistics section. Visitors are the players themselves, their families,
and friends who want to follow the trip.

A companion Google Sheet (one per year, e.g. "2026 Maroon Masters") is where scores are
recorded during the trip. A Google Apps Script (`appscript/live-feed.gs`) reads that
sheet and feeds the live leaderboard during the event. Historical years are hand-entered
once into this repo's `lib/data/*.ts` files after the trip ends — there is no live sync
for past years.

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **Data:** Static TypeScript data files in `lib/data/` — no database. Each past
  tournament is one file (`2024-pinehurst.ts`, `2025-danzante.ts`, `2026-palm-springs.ts`)
  conforming to the `Tournament` type in `lib/data/types.ts`. The upcoming tournament
  (`2027-upcoming.ts`) is a lighter `UpcomingTournament` type until its roster is final.
- **Live data:** Google Apps Script web app (`appscript/`) reads the live year's Google
  Sheet and feeds `lib/data/live.ts` / the live leaderboard components during the trip.
- **Hosting:** static Next.js build (no server-side secrets beyond what's already in `.env`).

## Pages / flows (existing, unchanged by this task)

- `/` — home
- `/history` — list of every past edition, links to that year's leaderboard
- `/leaderboard`, `/leaderboard/[slug]` — team + individual leaderboard for a given year;
  `/leaderboard/[slug]/players/[player]` — that player's scorecard for that year;
  `/leaderboard/[slug]/players/[player]/[round]/[hole]` — hole detail
- `/teams`, `/teams/[slug]` — roster directory for a given year (Maroon / White / Rankings tabs)
- `/schedule`, `/schedule/[slug]` — match schedule for a given year

All pages are public, no auth.

## Data model (existing)

- `Tournament` (`lib/data/types.ts`): slug, venue, location, dates, roster, team points,
  `matches: RealMatch[]`, `individualLeaderboard: IndividualStanding[]`, optional
  `scorecards: PlayerScorecard[]` (per-player, per-round, per-hole detail).
- `PlayerProfile` (`lib/data/players/*.ts`): id, slug, fullName, avatarSrc, bio, history —
  one file per player, looked up via `getPlayerProfile`/`getPlayerDisplayName`/`getPlayerAvatar`.

## This round's work

### 1. Fix 2026 venue
`lib/data/2026-palm-springs.ts` currently has `venue: "PGA West"`. The 2026 trip was
actually hosted at **Mission Hills CC** (the trip also included some rounds at Indian
Wells, but the site's single `venue` field should just say "Mission Hills CC", consistent
with how `2027-upcoming.ts` already lists it). Change the `venue` field only — leave the
per-round `course` labels in `lib/data/scorecards-2026.ts` (Palmer #1, Cove, Classic,
Pete Dye #1, Pete Dye #2, Tournament) untouched; confirmed these are the real labels from
the source sheet.

**Done when:** `venue` reads "Mission Hills CC"; `/teams/2026-palm-springs`,
`/leaderboard/2026-palm-springs`, and `/history` all render the new venue with no other
visual regression.

### 2. Trim the Rankings tab on Teams pages
In `components/teams/TeamsDirectory.tsx`, the **Rankings** view of `PlayerRow` currently
shows a rank number, the score (`ScoreBadge`/`toPar`), and a "Bio" link — same component
used by the Maroon/White views. Change: on the **Rankings** view only, drop the score
badge and the "Bio" link (rank number + name + team label stay). Maroon and White tabs
keep showing Bio exactly as today. Scores remain visible elsewhere (the leaderboard pages).

**Done when:** `/teams/[slug]` → Rankings tab shows rank + player + team only, no score
chip, no Bio button; Maroon/White tabs unchanged.

### 3. New "Stats" tab on the Teams page
Add a 4th tab — **Stats** — next to Maroon / White / Rankings in `TeamsDirectory`
(`components/teams/TeamsDirectory.tsx`, `app/teams/[slug]/page.tsx`). Unlike the other
three tabs, Stats is **not scoped to the year currently selected** — it always shows the
same career-wide data regardless of which year's Teams page you're on, since career stats
span all 3 played years (2024, 2025, 2026). It is not shown on the upcoming-2027 page
(no roster yet).

The Stats tab has its own sub-switch: **Player** | **Course**.

#### Player view
Two columns, same visual style as the existing Maroon/White roster rows
(`PlayerRow` in `TeamsDirectory.tsx`): **Maroon team on the left**, alphabetical;
**White team on the right**, alphabetical. Where a player's row would normally show a
"Bio" button, it instead shows a **"Stats"** button — maroon-colored button
(`bg-maroon-700 text-cream-50`, matching `TeamBadge`'s maroon "solid" styling) for Maroon
players, white-colored button (`bg-white text-maroon-700 border-maroon-700`) for White
players. Clicking it opens that player's stats breakdown (new route, e.g.
`/teams/stats/players/[player]`).

The player stats breakdown shows, **per year (2024 / 2025 / 2026) side by side**, every
stat category below. Cells for a category a given year didn't track read
**"Not recorded for this year."** No blended "career average" is computed for rate-based
stats (averages/percentages) since that would require raw counts this data doesn't
expose; cumulative count stats (Total Earned, Total Skins, Total Birdie-or-Better, Total
Double-or-Worse, Total 1-Putts, Total 3+-Putts) additionally get a **Career Total**
column that sums whichever years have data.

Standardized stat categories (source: yearly Google Sheet exports already reviewed):

| Category | 2024 | 2025 | 2026 |
|---|---|---|---|
| Scoring Average | not recorded (sheet only has to-par, not raw average) | ✓ | ✓ |
| Team Points Won | not recorded | ✓ | ✓ |
| Total Earned ($) | ✓ | ✓ | ✓ |
| Total Skins | ✓ | ✓ | ✓ |
| Putting Average / Avg Putts per Hole | not recorded | ✓ | ✓ |
| Par 3 / Par 4 / Par 5 avg score | not recorded | not recorded | ✓ |
| GIR % | ✓ | ✓ | ✓ |
| FIR % | ✓ | ✓ | ✓ |
| Total 1-Putts (% + count) | not recorded | ✓ | ✓ |
| Total 3+-Putts (% + count) | ✓ | ✓ | ✓ |
| Up & Down % | ✓ | ✓ | ✓ |
| Total Birdie-or-Better | not recorded | ✓ | ✓ |
| Total Double-or-Worse | not recorded | ✓ | ✓ |
| Bounce Back % | not recorded | ✓ | ✓ |
| Fall Off % | not recorded | ✓ | ✓ |
| Strokes Gained: Total / Off Tee / Approach / Around Green / Putting | ✓ (all 5) | ✓ (all 5) | ✓ (all 5) |

#### Course view
Switching to "Course" shows a year selector (2024 / 2025 / 2026 — course stats aren't
blendable across years since different courses were played each year). For the selected
year:
- Hole Difficulty Ranking (score differential, ranked hardest → easiest), with
  Par 3 / Par 4 / Par 5 hardest/easiest/worst-performer call-outs
- Green Difficulty Ranking (GIR %) — not recorded for 2024
- Fairway Difficulty Ranking (FIR %) — not recorded for 2024
- Most 3-Putted Green / Most 1-Putted Green — not recorded for 2024

**Done when:** Stats tab appears on every past year's `/teams/[slug]` page (not on
`/teams/2027`), Player view renders both team columns with working Stats buttons styled
per team color, the player stats page renders the table above with correct "not
recorded" cells for 2024, and Course view lets you pick a year and see that year's hole
rankings. All numbers traced back to the CSVs already reviewed for this spec — no
numbers invented or computed beyond the explicit sums noted above.

## Out of scope for this round

- Populating `PlayerProfile.bio`/`history` (still empty placeholders) — unrelated to this task.
- Any change to the live-scoring Apps Script or the 2027 (upcoming) sheet pipeline.
- Computing/inferring any stat number not explicitly present in the reviewed sheet exports.
