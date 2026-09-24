# Tiger Center: Round → Session Rename, Session Tee Times, Matchups Redesign — Design

**Status:** v1 (2026-09-24) — all design questions answered by the user; ready for implementation planning. Nothing in this document is built yet.
**Scope:** (1) Rename the live/upcoming tournament's "Round" concept to "Session" across UI and code. (2) Add 3 tee-time slots to each Session on the Courses & Format page, in Pacific Time. (3) Locking a Session's tee times derives each Matchups match's own tee time from them, which already drives that match's automatic Scheduled → Armed → Live transition. (4) Redesign the Matchups page's per-match layout, format by format, to show who scores for whom.
**Not in scope:** Historical/archived tournament data (2024–2026 static `lib/data/*.ts`, Career Stats archive, "Round INDI", `ArchiveTeeAssigner`, the handicap system's own "round" concept). These keep saying "Round" — they are a separate, older feature and the user does not want them touched. The `live_round_state`/`live_match_boxes` table and column names in Supabase are also unchanged (see §1).

---

## 1. Round → Session rename

**What changes:** every place a person sees the word "Round" for the *live, upcoming* tournament — Courses & Format, Matchups, the public Schedule page's upcoming-tournament boxes, the live Scoring tab, `StartRoundBanner`, Match Closeout, broadcast controls, and the 2034 test-season rehearsal tools — becomes "Session." Code identifiers for this same concept are renamed too, so the vocabulary in the code matches what's on screen:

| Before | After |
|---|---|
| `LiveRoundState` | `LiveSessionState` |
| `LiveRoundState.round` | `LiveSessionState.session` |
| `TournamentSettings.roundCount` | `TournamentSettings.sessionCount` |
| `LiveMatchBox` | `LiveMatch` |
| `LiveMatchBox.boxNumber` | `LiveMatch.matchNumber` |
| `boxesPerRound()` | `matchesPerSession()` |
| `playersPerTeamPerBox()` | `playersPerTeamPerMatch()` |
| `/api/portal/tiger/rounds*` | `/api/portal/tiger/sessions*` |
| `/api/portal/tiger/matchboxes*` | `/api/portal/tiger/matches*` |
| "Box 1" / "Box N" (UI text) | "Match 1" / "Match N" |
| "Round 1" / "Round N" (UI text) | "Session 1" / "Session N" |

**What does not change:** the Supabase table names `live_round_state` and `live_match_boxes`, and their `round` / `box_number` columns. Renaming a live production table with real data needs a migration and buys nothing visually — the confusion this task is fixing is in vocabulary people read and code people (and Claude) read, not in column names nobody sees. The API/data layer becomes the translation point: it reads `round`/`box_number` columns and maps them onto `session`/`matchNumber` fields in code.

**Also not changed:** the historical/archived "Round" concept (`CareerRoundArchive.tsx`, `RoundFormatArchive.tsx`'s "Round INDI", `ArchiveTeeAssigner.tsx`, `roundLabel.ts`, `lib/data/archivedScorecards.ts`, the handicap system's `RoundInProgressCard.tsx`/`RoundExit.tsx`). These describe a different, older, unrelated feature (a specific past tournament's per-round scorecards, or an individual's self-submitted handicap round) and stay exactly as they are.

**Known, accepted overlap:** the public Schedule page (`VenueSchedulePage.tsx`) already has a `VenueSession`/`SessionBox` type used only for **past** tournaments' schedule display — an older AM/PM-session concept left over from before rounds were flattened to one-per-day (see `supabase/schema.sql`'s "Flattens live_match_boxes off the original 4-day/2-session/3-box grid" comment). That is untouched (it's historical data). The *new* Session concept for the upcoming tournament lives in the same file as a separate component (today called `RoundBox`, reading `UpcomingRoundScheduleItem`) — it gets renamed to something distinguishable in code (e.g. `UpcomingSessionBox`) so the two "Session" ideas don't collide as identifiers, even though a visitor reading a past year's schedule and the upcoming year's schedule will see the word "Session" in both, meaning two different things. This is a pre-existing naming coincidence, not something this task introduces or needs to resolve.

## 2. Session tee times (Courses & Format page)

Each Session box gains a row of 3 tee-time inputs below the existing date/course/format row, labeled per format:

- **Fourball / Foursome (Alternate Shot):** "Match 1", "Match 2", "Match 3"
- **Singles:** "Match 1 & 2", "Match 3 & 4", "Match 5 & 6"

Each is a plain `<input type="time">`, disabled once the Session is locked (same pattern the date/course/format inputs already use). A short caption under the row states times are Pacific Time.

**Data model:** `LiveSessionState` gains `matchTeeTimes: (string | null)[]` — always exactly 3 entries, each an "HH:MM" wall-clock string or `null` if not yet set. Stored as a new column on `live_round_state` (e.g. `match_tee_times jsonb`, a 3-element array of strings or nulls — chosen over 3 separate columns since it's always the same shape and is only ever read/written as a unit).

**Locking:** reuses the existing course/format Lock control (today's `courseLocked`, renamed for consistency — exact field name is an implementation detail). One Lock action fixes date, course, format, **and** the 3 tee times together, matching how the page already works today (there is no second lock to add).

**Timezone handling:** a typed time (e.g. "7:30") plus the Session's date is always interpreted as Pacific Time (`America/Los_Angeles`, so it tracks PDT/PST automatically) when converted to the absolute instant stored for each match — regardless of the browser timezone of whoever is typing it. This fixes an existing bug: `MatchupsPanel.tsx`'s current `saveBox()` builds `new Date(`${round.date}T${draft.teeTime}:00`)`, which today is silently interpreted in the *browser's* local timezone. Anywhere a tee time is displayed (Matchups, the public Schedule page, the live Scoring tab, `StartRoundBanner`), it is shown converted back to Pacific and explicitly labeled, e.g. "7:30 AM PT" — so it reads correctly no matter what timezone the viewer's own device is in.

## 3. What "locked" actually does to match timing

This needs less new work than it sounds like, because the automatic start mechanism already exists: `effectiveMatchState()` (`lib/live/orchestration.ts`) already compares "now" to a match's own `teeTime` and returns `"Live"` once it has passed — no manual button required, already unit-tested. Tiger's "Start Match" button (`matchboxes/start`) is a separate manual override for when a real-world tee time slips, and stays exactly as it is.

What changes is *where a match's `teeTime` comes from*. Today it's typed independently per match on the Matchups page. After this change, each match's `teeTime` is **derived** from its Session's 3 locked `matchTeeTimes`, combined with the Session's `date`:

- Fourball / Foursome: Match 1 ← `matchTeeTimes[0]`, Match 2 ← `matchTeeTimes[1]`, Match 3 ← `matchTeeTimes[2]`.
- Singles: Match 1 & Match 2 ← `matchTeeTimes[0]`, Match 3 & Match 4 ← `matchTeeTimes[1]`, Match 5 & Match 6 ← `matchTeeTimes[2]`.

Match 1's tee time (Match 1 & 2's, for Singles) is treated as "the Session starts at" wherever that's shown or used: the public Schedule page's Session box, the live Scoring tab, and `StartRoundBanner`.

## 4. Matchups page redesign

Header becomes "Session N — Format." The page's intro copy updates from "match boxes" to "matches." Each match card shows its tee time as **read-only** text (inherited from the Session, e.g. "7:30 AM PT") instead of today's editable `<input type="time">` — since it's now locked in on the Courses & Format page before a Session ever appears in Matchups (Matchups already only shows a Session once its course/format — now also its tee times — are locked, so there's no new empty state to handle).

Player-assignment dropdowns are unchanged in behavior. The visual arrangement of each match's 4 (or 2, for Singles) player slots is redesigned per format to show the real "who scores for whom" relationship that already exists in `canScoreStrokesFor()` (`lib/live/orchestration.ts`, already shipped and tested) — that function pairs players by **opponent**, not teammate, in every format:

- **Fourball** (2 opponent pairs): two rows, each with a Maroon player on the left and a White player on the right, "Scoring For" between them in each row:
  ```
  [Maroon Player 1]   Scoring For   [White Player 1]
  [Maroon Player 2]   Scoring For   [White Player 2]
  ```
  The Maroon boxes are colored maroon in both rows, White boxes white in both rows (so the team columns still read clearly), but the "Scoring For" label sits *between the opponents in each row*, matching `canScoreStrokesFor`'s real position-based opponent pairing (confirmed by its own test: "cam is paired with cade, not collin").

- **Foursome / Alternate Shot** (side vs. side, one shared score per side, either of 2 players per side may enter it): the same 2×2 box arrangement, but **one** "Scoring For" label centered between all 4 boxes, since the relationship is team-to-team rather than a specific opponent pair.

- **Singles** (1 opponent pair per match, 2 matches per tee time): each match is the same left/right shape as one Fourball row —
  ```
  [Maroon Player]   Scoring For   [White Player]
  ```
  — with a visible gap/divider between Match 1 and Match 2 (and 3&4, 5&6) to show they're two separate matches sharing one tee time.

No changes to match validation, scoring-authorization logic, or `canScoreStrokesFor()` itself — this section is purely the Matchups page's display layout catching up to a pairing rule that's already real and already tested.

## 5. Testing

- Unit tests for the timezone conversion helper (typed "HH:MM" + session date → correct UTC instant for Pacific, across a DST boundary).
- Unit tests for deriving each match's `teeTime` from its Session's `matchTeeTimes` (Fourball/Foursome 1:1, Singles 2:1 grouping).
- Existing `orchestration.test.ts` coverage (`effectiveMatchState`, `canScoreStrokesFor`) is unaffected and stays green — this task doesn't change that logic, only what feeds `teeTime` into it and how matches are laid out on screen.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean, per this repo's existing standard.
- Manual/browser check of the Courses & Format tee-time inputs and the Matchups per-format layouts, since these are new UI surfaces behind Tiger login.

## 6. Open questions

None remaining — every design decision above was confirmed with the user, including two direct corrections (Singles/Alt Shot are opponent-based, and Fourball's real pairing is opponent-based too, not partner-based, matching the already-shipped `canScoreStrokesFor`).
