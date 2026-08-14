# Live Scoring Platform — Design Spec

## Vision

Build the actual scoring platform players and Tiger use *during* the
tournament: players enter hole-by-hole scores for themselves and their
round partner, and Tiger runs pairings and round start/reset and can edit
any score directly. This is sub-projects #2 ("Player Portal — scoring")
and #3 ("Host Tools") from
`docs/superpowers/specs/2026-08-04-accounts-foundation-design.md`,
combined into one round, plus it resolves that spec's deferred #4: scoring
keeps writing to the Google Sheet — `appscript/live-feed.gs` and the
public `/leaderboard` pages are unchanged.

Both halves of `/portal` currently say "coming in a later round"
(`app/portal/page.tsx`) — this spec is that round.

## Starting point: what already exists

`appscript/write-scores.gs` is a complete, working backend for exactly
this — hole-by-hole score writes, pairings, round lifecycle — built for
the old standalone "scorekeeper" app (a separate Vercel project, retired
in the accounts-foundation round). It has two built-in auth systems tied
to that old app, neither used by `/portal` today:

- **Player codes** — each player had one 6-character code, typed into the
  old app, resolved server-side to a player name.
- **Host login** — a username/password stored in the Sheet itself
  (`Host Login` tab), independent of everything else, producing a
  12-hour HMAC token.

`/portal` already knows who's signed in via Supabase (`profiles.is_host`,
`profiles.player_slug`) — both of those are now redundant. This spec
replaces them with one shared-secret trust relationship between the
Next.js server and the Apps Script backend.

## Backend contract changes (`appscript/write-scores.gs`)

**Removed entirely:** `validateCode`, `submitHoleAs`, `handleValidateCode`,
`handleSubmitHoleAs`, the `Player Codes` sheet + code-email flow
(`handleHostSetPlayerCodes`, `handleHostRegenerateCode`, `sendCodeEmail`,
`defaultCodeEmailBody`), the `CADE_MASTER_CODE` backdoor and its two
handlers, `hostLogin`/`verifyHostToken`/`makeHostToken`/`hashPassword`,
the `Host Login` sheet, and the "Set Host Password" menu item.

**Added:** every remaining `doPost` action takes `{ serverSecret,
actingAs, isHost }` instead of `{ code }` or `{ token }`. A single
`checkServerSecret(serverSecret)` guard (compares against a
`SCOREKEEPER_SERVER_SECRET` value in `PropertiesService`, same pattern as
today's `RAW_EMAIL_SECRET`) replaces `verifyHostToken`/code lookup at the
top of each handler. `actingAs` is the player's real name, already
resolved server-side by Next.js from `profiles.player_slug` — the Apps
Script no longer resolves identity itself, it trusts what the secret-
bearing caller says.

**Kept as-is (just re-gated):** `readPairings`/`handleHostSetPairings`/
`handleHostDeletePairing`, `readRoundState`/`handleHostStartRound`/
`handleHostResetRound`, `writeHoleScore`/`readPlayerRoundHoles`,
`handleHostGetData`, `handleHostSubmitHole`, `handleHostGetPlayerRound`,
`readPlayerEmails`/`handleHostSendRawEmail` (still useful for other host
comms, unrelated to login).

**New handler**, replacing the old code-based player read: `playerGetRound`
— given `actingAs` + a round number, returns that player's holes, their
pairing partner for that round (if any), and the partner's holes. Same
shape `handleValidateCode` used to return per round, just without the
code lookup.

Because `Player Data Pull`, `Pairings`, and `Round State` are untouched,
`appscript/live-feed.gs` and the public site need zero changes — any
score written through the new tools shows up on `/leaderboard` exactly
like it does today.

## Next.js side: calling the backend

- New env var `SCOREKEEPER_SERVER_SECRET` (added to `.env.example`,
  server-only, never sent to the browser) — must match the value set in
  the Apps Script's `PropertiesService`.
- Both reads and writes POST to the same `LIVE_FEED_URL` (the Apps
  Script comment already notes the one deployment handles `GET` = live
  feed, `POST` = this file — no new URL/deployment needed).
- All calls happen in Next.js Server Actions (not client-side fetch) so
  the secret never reaches the browser, following the same
  service-role-key-stays-server-side pattern the accounts-foundation
  spec used for `SUPABASE_SERVICE_ROLE_KEY`.
- Every action first re-derives identity server-side from the Supabase
  session (`profiles.is_host` / `profiles.player_slug`) — the same check
  `/portal` and `/portal/admin` already do — before calling out to Apps
  Script. A player action always sends their own resolved name as
  `actingAs`; nothing player-supplied is trusted as identity.

## Player scoring UI (`/portal`)

Replaces the "Scoring and pairings are coming in a later round" line in
the player branch of `app/portal/page.tsx`.

- **No round started yet:** waiting message, same idea as the old app's
  "Waiting for the host to start a round."
- **Round(s) started:** two tabs — **My Score** and **[Partner]'s
  Score** (partner resolved from that round's `Pairings` row; if none is
  assigned yet, that tab shows "No partner assigned for this round
  yet"). Each tab is a hole-by-hole entry view for the active round:
  score, putts, FIR (hidden/skipped on par-3 holes, matching
  `write-scores.gs`'s existing `isPar3` behavior), GIR. Saves per hole
  as it's entered (calls the new `playerSubmitHole` action), not a
  single "submit all 18" step.
- Reuses the existing look of `components/scorecard/` (e.g.
  `ScorecardRow.tsx`, `HoleDetailCard.tsx`) for the entry rows rather
  than introducing a new visual style — this becomes the *editable*
  counterpart to the read-only `LivePlayerScorecard.tsx`.
- If more than one round is started at once (shouldn't normally happen,
  but the backend allows it), each gets its own My Score/Partner's Score
  pair, stacked — matches old behavior (`rounds: []` array).

## Host tools UI (new `/portal/host`)

Linked from the Tiger landing branch of `/portal` (next to the existing
link to `/portal/admin`). Gated the same way `/portal/admin` is today —
`redirect("/")` if `!profile.is_host` — no additional login layer.

- **Pairings** — pick a round, session, format, then 2 Maroon + 2 White
  players from the roster (click order = slot order, same semantics as
  today). List of existing pairings for the round with delete.
- **Rounds** — Start / Reset button per round number, mirroring
  `handleHostStartRound`/`handleHostResetRound`. Reset requires a confirm
  step (it erases entered scores for that round).
- **Score editor** — pick any player + round, see and edit all 18 holes
  directly (score, putts, FIR, GIR), same fields as the player view but
  usable on anyone.

`/portal/admin` (usernames, MM Coins settlement) is untouched and stays
separate — it's site-account administration, not in-tournament game
control.

## Data flow

```
Browser (Supabase session cookie)
  -> Next.js Server Action (re-derives identity from session)
  -> POST { serverSecret, actingAs, isHost, ...action-specific fields }
  -> write-scores.gs (checks serverSecret, writes/reads "Player Data Pull" /
     "Pairings" / "Round State" sheets)

Public site (unchanged):
  /leaderboard, /leaderboard/[slug]/players/[player]
  -> GET /api/live-feed -> live-feed.gs -> same Google Sheet
```

No new database tables. No changes to `lib/data/live.ts`,
`liveFeedNormalize.ts`, or `/api/live-feed/route.ts`.

## Error handling

- Round not started → clear waiting message, no entry form shown (mirrors
  today's `waiting: "Waiting for the host to start a round."`).
- No partner assigned yet for the round → that tab explains it instead of
  erroring.
- Score write fails (network hiccup, Sheet unreachable) → inline error on
  that hole, the typed value stays in the field so it isn't lost, retry
  available — never silently drop an entry.
- `SCOREKEEPER_SERVER_SECRET` missing/mismatched → action fails closed
  with a generic "Could not reach the scoring system" (never leaks
  whether the secret itself was the problem).
- Non-host hitting `/portal/host` → redirect to `/`, same pattern as
  `/portal/admin`.

## Testing

- Next.js: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
  all clean, same bar as the accounts-foundation round.
- `write-scores.gs` has no automated test harness (same as today — Apps
  Script code isn't part of the Next.js build/CI). Verified manually
  against a sandbox copy of the Sheet: start a round, submit holes as a
  player for self and partner, confirm they land in `Player Data Pull`
  and show up on `/leaderboard`; set pairings and delete one; start/reset
  a round; edit a player's score as host; confirm removed actions
  (`validateCode`, old `hostLogin`, etc.) are actually gone from
  `doPost`'s routing. This manual pass is a required step before calling
  the round done, and gets called out as a remaining task in
  `project_specs.md`, the same way accounts-foundation's Supabase
  live-verification step was.

## Explicitly out of scope

- Any change to `/leaderboard`, `/teams`, `/schedule`, `/history`, or
  `live-feed.gs`.
- Moving scoring off the Google Sheet onto a database — deliberately
  resolved *against* in this spec (see Vision).
- `/portal/admin` (usernames, MM Coins settlement) — untouched.
- Real-time push updates (WebSockets/live-refresh) for the player/host
  scoring screens — they read on load and after each save, same polling-
  free-until-you-act model the old scorekeeper app used. Live-refreshing
  the *public* leaderboard while someone is mid-round is unchanged
  (already polls `/api/live-feed`).
- A second, Apps-Script-only host password — explicitly decided against;
  Tiger's single Supabase login is the only gate on `/portal/host`.
