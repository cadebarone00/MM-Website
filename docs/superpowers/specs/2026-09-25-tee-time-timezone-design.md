# Tee Time Timezone: Configurable Venue Zone + Viewer-Local Display — Design

**Status:** v1 (2026-09-25) — all design questions answered by the user; ready for implementation planning. Nothing in this document is built yet.
**Scope:** (1) Add a per-tournament-year timezone setting so a session's tee times can be entered in whatever zone that year's venue actually sits in, instead of hardcoded Pacific. (2) Admin screens (Matchups, the Career Stats archive) keep showing that venue-local time — what Tiger actually typed. (3) Every other tee-time display on the site (public match profile, live leaderboard cards, the player portal's Scoring tab and "My Matches" cards) instead renders in whoever is *looking at it's* own local time, since the trip travels and players/family follow from wherever they are.
**Not in scope:** re-deriving anything for past/historical tournaments (2024–2026, out of scope per the prior Sessions/Matchups spec and unaffected here); changing which formats/matches exist; any change to the underlying `deriveMatchTeeTime` slot-grouping math (Fourball/Foursome 1:1, Singles 1&2/3&4/5&6) — only *which* timezone that math treats the typed "HH:MM" as changes.

---

## 1. Data model

`live_tournament_settings` gains a `timezone text not null default 'America/Los_Angeles'` column — the default matches the 2027 season's real venue (California) exactly, so nothing changes for the setup already in progress until someone deliberately picks a different zone for a future year. `TournamentSettings` (`lib/live/types.ts`) gains `timezone: string`.

A new `lib/data/timezones.ts`, following the existing `lib/data/usStates.ts` pattern (a small constants file: `{ id: string /* IANA zone */; label: string }[]`), holds a curated list rather than the full IANA database — a raw 400+ option dropdown is bad UX for a trip that only ever lands in a handful of real places. Starting list: Pacific, Mountain, Central, Eastern (the four US zones), plus Mexico's Mountain-equivalent zone (`America/Mazatlan`, matching where Danzante Bay actually sits) since this trip has already used it once. More can be added the same way `usStates.ts` already supports the full 50 states — this is a data file, not a hardcoded UI constraint.

## 2. Input UI: `MasterSettingsPanel.tsx`

The existing "Venue Name" section gains a timezone `<select>` right next to it, sharing that section's existing lock toggle (`venueLocked`) rather than introducing a third lock — venue and timezone are the same real-world fact (where the trip is happening) and should lock/unlock together. `POST /api/portal/tiger/master-settings` gains `timezone` alongside its existing `venueName`/`venueLocked`/etc. fields, written straight through (no special validation beyond "is one of the curated list's ids").

## 3. Derivation: `lib/live/sessionTeeTimes.ts`

`deriveMatchTeeTime(date, timeOfDay)` and its internal `pacificOffsetMinutes` helper become `deriveMatchTeeTime(date, timeOfDay, timezone)` / `offsetMinutes(instant, timezone)` — the hardcoded `PACIFIC_TZ` constant is deleted, its value becomes a caller-supplied parameter. `formatPacificTeeTime` becomes `formatTeeTimeInZone(date, timezone)`, still producing a short-zone-abbreviation label (e.g. "7:30 AM PST") but for whatever zone is passed in, not just Pacific — this is the function admin screens use with the tournament's configured zone. The two DST-transition-day tests already covering Pacific keep passing unchanged (default-argument-equivalent behavior for that one zone); one or two new tests confirm a *different* zone (e.g. `America/Chicago`) also converts correctly, proving the parameterization actually works and isn't just a renamed constant.

Every caller that currently derives or formats a tee time in "the" timezone needs the tournament's `timezone` value threaded in:
- `app/api/portal/tiger/matches/route.ts` (match creation) — already fetches the session row; add `timezone` to its `live_tournament_settings` read (joined by `season_year`).
- `app/api/portal/tiger/sessions/lock/route.ts` (re-derivation on lock, added in the prior plan's final-review fix) — same addition.

## 4. Admin displays stay venue-local

`components/portal/tiger/MatchupsPanel.tsx` and the Career Stats "Round Format Archive" page (`lib/data/liveRoundFormatArchive.ts`, rendered via `components/portal/tiger/RoundFormatArchive.tsx`) both currently call the Pacific-hardcoded formatter directly. Both already run in a context that has (or can easily fetch) the tournament's settings for the relevant year — `MatchupsPanel`'s server page (`app/portal/admin/master-settings/[year]/matchups/page.tsx`) gains a `live_tournament_settings` fetch and passes `timezone` down as a new prop; `career-stats/page.tsx` does the same for `liveRoundFormatArchive`'s caller. Both switch from the old fixed-Pacific formatter to `formatTeeTimeInZone(date, timezone)`.

This deliberately does **not** touch `CoursesFormatPanel.tsx`'s tee-time `<input type="time">` fields themselves — those already just hold and echo back the raw typed "HH:MM" string, which has no timezone ambiguity to fix (it *is* whatever zone the tournament is configured for; the input just needs a small caption next to it naming that zone, e.g. "Tee times are venue-local (Pacific Time)." instead of the current hardcoded "Tee times are Pacific Time.").

## 5. Everyone else: viewer-local

A new shared client-side helper (`lib/live/viewerLocalTime.ts`, `formatViewerLocalTeeTime(date: Date): string`) calls `toLocaleTimeString` with **no explicit `timeZone` option** (letting the browser use its own local zone, which is what "viewer-local" means) plus `timeZoneName: "short"` so the result is self-labeling (e.g. "7:30 AM CDT" for a Chicago-based viewer looking at the same instant a Pacific-based one sees as "7:30 AM PT" via §4's venue-local path) — nobody has to guess which zone a bare "7:30 AM" is in.

Four call sites, each already investigated:

- **Public match profile page** (`lib/live/matchProfile.ts`'s `profileMatch()`, called from `components/match/LiveMatchProfile.tsx`, a `"use client"` component that fetches the raw `tee_time` and formats it *in the browser already* — no data-shape change needed, just swap the hardcoded-Pacific call for `formatViewerLocalTeeTime`).
- **Live leaderboard cards** (`components/leaderboard/LiveLeaderboardContent.tsx`, also already `"use client"`, same trivial swap).
- **Scoring tab landing screen** (`components/portal/ScoringStatusScreen.tsx`) — currently has no `"use client"` directive and is rendered from a server component page that already passes it the full `CurrentSessionResult` (including the raw `matchBox.teeTime: Date`) as a prop. Add `"use client"` to this file and swap its `formatTeeTime` helper to call `formatViewerLocalTeeTime`. No prop-shape change required — the raw Date is already there.
- **Portal home "My Matches" cards** (`lib/portal/matchCards.ts`'s `liveMatchCard()`, consumed via `lib/portal/liveMatchCards.ts`'s `buildLiveMatchCards()`, called from `app/portal/page.tsx`, a server component) — this is the one site where the formatted string is currently built *server-side* and handed down as a plain string prop, so there's no browser to be "viewer-local" in yet. `PortalMatchCard`'s `progressLabel` field (today a fully-formatted string like "Thu Jan 6, 7:30 AM PT") splits into keeping `progressLabel` for the non-time parts (weekday/date) and adding a new `upcomingTeeTime: string | null` field carrying the raw ISO instant instead of a pre-formatted time. Whatever client component actually renders a `PortalMatchCard` (to be identified precisely during plan-writing — it renders somewhere under the portal home page) calls `formatViewerLocalTeeTime(new Date(card.upcomingTeeTime))` at render time instead of printing a pre-baked string.

## 6. Testing

- `lib/live/sessionTeeTimes.test.ts`: existing Pacific-zone tests keep passing with the zone now passed explicitly; add a same-shape test for a second zone (`America/Chicago`) to prove the parameterization isn't a no-op.
- Manual/browser verification (consistent with this repo's established pattern for admin-gated screens): confirm the Matchups page and Career Stats archive show venue-local time for a non-Pacific test tournament-year setting, and confirm a match profile page / leaderboard card renders differently when viewed from a browser set to a different local timezone (DevTools timezone override, or two machines).

## 7. Open questions

None remaining — every design decision above was confirmed with the user (venue lock sharing, curated zone list vs. full IANA picker).
