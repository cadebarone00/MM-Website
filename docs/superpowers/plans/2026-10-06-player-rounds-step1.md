# Player Rounds — Step 1 (dev preview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the dev preview, a round submitted on the trip is saved once to the player's (mock) account and shows on the trip, in that account's Profile → Rounds and in their handicap; plus the Public / Private setting and History "Link to account" requests with Accept / Decline.

**Architecture:** Pure, tested logic in `lib/platform/` (round building + handicap eligibility, privacy, history link requests). A dev-only store (`lib/dev/devPlayerRounds.ts` reducer + `components/dev/useDevPlayerRounds.ts` hook, kept in `sessionStorage`) holds every mock account's rounds, privacy and link requests, so the trip page, the dev profile page and Organizer settings → History all read and write the same records. The simulator gets "Signed in as <mock account>" conditions.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, `node:test` via `tsx --test`, CSS modules / Tailwind (existing), Playwright for the browser check.

**Spec:** `project_specs.md` → "Round: Player rounds — one saved round per account, shown on the trip and the profile (spec 2026-10-06, approved 2026-10-06)".

## Global Constraints

- Dev preview only: no database, no SQL, no server routes, no changes to `/profile`, `/settings` or real trips.
- A round is saved once per account per round played (`PlayerRound.id` is deterministic; saving the same id again changes nothing — locked after submit).
- Handicap counts only when: 18 holes, own-ball format (not scramble / alternate shot / foursome / shamble / greensome / chapman), a tee with rating + slope (slope 55–155), entered by the player.
- History-linked rounds: `enteredBy: "organizer"`, never count, need the player's Accept.
- Privacy default: Private. Private = owner sees everything; others see the handicap index only if they play together (same trip); Public = every signed-in account sees rounds + handicap.
- Handicap index = existing `lib/handicap/whs.ts` (`calculateDifferential`, `calculateHandicapIndex`, `calculateLowIndex`), needs 3+ counting rounds, most recent 20.
- Don't commit (owner commits). Never `git stash` / `checkout` / `reset` — another terminal shares the tree.
- Test command: `npx tsx --test <file>`; full suite `npm test` (3 known older failures: featureRegistry count, playDemo import, GolfTripChat color — not ours).

**Two deviations from the spec text, to confirm with the owner when handing off:**
1. 9-hole rounds are saved but marked "not counted" in Step 1 (WHS 9-hole scoring needs the player's index and a 9-hole rating — Step 2).
2. Link requests show in a **Requests** card on the dev profile page, because the app has no notification inbox yet (the trip's Notifications screen is only on/off switches).

## Review Focus

1. Submitting the same trip round twice (double tap, or reload then the card shows Submitted) → still exactly one saved round. Test in Task 3.
2. Empty / corrupt / old `sessionStorage` data → the dev store falls back to the seed without crashing. Test in Task 3.
3. A course tee with no rating or slope (the course API often has none) → round saved, listed as "No course rating for this tee", handicap unchanged. Test in Task 1.
4. Accepting a link request twice, or after Decline → no duplicate rounds, status stays final. Test in Task 2.
5. A Private profile viewed by someone not on the trip → sees neither rounds nor handicap; the owner always sees everything. Test in Task 2.

---

### Task 1: Player round model + handicap eligibility

**Files:**
- Create: `lib/platform/playerRounds.ts`
- Test: `lib/platform/playerRounds.test.ts`

**Interfaces:**
- Consumes: `calculateDifferential(total, rating, slope)`, `calculateHandicapIndex(diffs)`, `calculateLowIndex(diffsOldestFirst)` from `lib/handicap/whs.ts`.
- Produces: types `ShotResult`, `RoundSource`, `PlayerRoundHole`, `PlayerRoundTee`, `PlayerRound`, `ScoredCard`, `PlayerRoundInput`; functions `playerRoundId(...parts: string[]): string`, `handicapEligibility(round)`, `buildPlayerRound(input): PlayerRound`, `holesFromCard(card, par): PlayerRoundHole[]`, `cardFromHoles(holes): ScoredCard`, `handicapSummary(rounds): { index: number | null; lowIndex: number | null; counting: number }`.

- [ ] **Step 1: Write the failing test** — `lib/platform/playerRounds.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerRound, cardFromHoles, handicapEligibility, handicapSummary, holesFromCard, playerRoundId, type PlayerRoundInput } from "./playerRounds";

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const card = (strokes: number) => ({
  strokes: PAR.map((par, i) => i === 0 ? par + (strokes - 72) : par),
  putts: PAR.map(() => 2), fairways: PAR.map((par) => par === 3 ? null : "center" as const), greens: PAR.map(() => "left" as const),
});
const input = (extra: Partial<PlayerRoundInput> = {}): PlayerRoundInput => ({
  id: playerRoundId("trip", "dev-trip", "round-2", "dev-cade"), profileId: "dev-cade", source: "trip", tripId: "dev-trip", tripRoundId: "round-2",
  datePlayed: "2027-04-23", course: { ref: null, name: "Canyon Ridge", place: "Scottsdale, AZ" }, tee: { name: "Blue", rating: 72, slope: 113 },
  holesPlayed: 18, format: "Singles Match Play", holes: holesFromCard(card(80), PAR), enteredBy: "player", ...extra,
});

test("an 18-hole own-ball round on a rated tee counts, with its differential", () => {
  const round = buildPlayerRound(input());
  assert.equal(round.total, 80);
  assert.equal(round.countsForHandicap, true);
  assert.equal(round.differential, 8);
  assert.equal(round.notCountedReason, null);
  assert.equal(round.status, "submitted");
});

test("rounds that don't qualify are saved but not counted, with a plain reason", () => {
  assert.match(buildPlayerRound(input({ format: "Scramble" })).notCountedReason ?? "", /Scramble/);
  assert.match(buildPlayerRound(input({ format: "Foursome" })).notCountedReason ?? "", /own ball/);
  assert.equal(buildPlayerRound(input({ format: "Fourball" })).countsForHandicap, true, "four-ball is own ball");
  assert.equal(buildPlayerRound(input({ tee: { name: "Blue", rating: null, slope: null } })).notCountedReason, "No course rating for this tee");
  assert.equal(buildPlayerRound(input({ tee: null })).notCountedReason, "No course rating for this tee");
  assert.equal(buildPlayerRound(input({ enteredBy: "organizer" })).notCountedReason, "Entered by organizer");
  assert.match(buildPlayerRound(input({ holesPlayed: 9, holes: holesFromCard(card(80), PAR).slice(0, 9) })).notCountedReason ?? "", /9-hole/);
  assert.equal(buildPlayerRound(input({ holes: holesFromCard(card(80), PAR).slice(0, 17) })).notCountedReason, "Not every hole was scored");
  const nope = buildPlayerRound(input({ format: "Scramble" }));
  assert.equal(nope.countsForHandicap, false);
  assert.equal(nope.differential, null);
});

test("a total-only round (History) keeps its total; bad scores are refused", () => {
  assert.equal(buildPlayerRound(input({ holes: [], total: 91, enteredBy: "organizer" })).total, 91);
  assert.throws(() => buildPlayerRound(input({ holes: [], total: undefined })), /total/);
  const holes = holesFromCard(card(80), PAR);
  holes[3] = { ...holes[3], strokes: 0 };
  assert.throws(() => buildPlayerRound(input({ holes })), /strokes/);
});

test("card ↔ holes keeps strokes, putts and shot results; par 3s have no fairway", () => {
  const holes = holesFromCard(card(80), PAR);
  assert.equal(holes[2].fairway, null);
  assert.equal(holes[0].strokes, 12);
  assert.deepEqual(cardFromHoles(holes), card(80));
});

test("handicap index needs 3 counting rounds and uses the most recent 20", () => {
  const counting = (total: number, date: string, id: string) => buildPlayerRound(input({ id, datePlayed: date, holes: holesFromCard(card(total), PAR) }));
  const scramble = buildPlayerRound(input({ id: "s", format: "Scramble" }));
  const two = [counting(80, "2027-01-01", "a"), counting(85, "2027-01-02", "b"), scramble];
  assert.deepEqual(handicapSummary(two), { index: null, lowIndex: null, counting: 2 });
  const three = [...two, counting(90, "2027-01-03", "c")];
  assert.deepEqual(handicapSummary(three), { index: 6, lowIndex: 6, counting: 3 }); // lowest of 8/13/18 = 8, −2.0 for 3 rounds
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './playerRounds'`)

Run: `npx tsx --test lib/platform/playerRounds.test.ts`

- [ ] **Step 3: Implement** — `lib/platform/playerRounds.ts`

```ts
import { calculateDifferential, calculateHandicapIndex, calculateLowIndex } from "@/lib/handicap/whs";

/**
 * Player rounds: one saved round per account per round played. The trip, its leaderboard, Profile → Rounds and the
 * handicap all read this same record — never a copy. See project_specs.md, "Player rounds — one saved round per account".
 * Pure functions, safe anywhere; Step 1 keeps the records in a dev store, Step 2 in the database.
 */

/** Where a shot finished (the Scoring sheet's arrows). "center" = fairway / green hit. */
export type ShotResult = "up" | "left" | "center" | "right" | "down";
export type RoundSource = "trip" | "tournament" | "personal" | "history";

export interface PlayerRoundHole { number: number; par: number; strokes: number; putts: number | null; fairway: ShotResult | null; green: ShotResult | null }
/** Snapshot at submit time; rating / slope are null when the course data has none. */
export interface PlayerRoundTee { name: string; rating: number | null; slope: number | null }

export interface PlayerRound {
  id: string;
  profileId: string;
  source: RoundSource;
  tripId?: string;
  tripRoundId?: string;
  historyTripId?: string;
  datePlayed: string;
  /** `ref` = the course API id (null for a typed course); name / place = the label saved at play time. */
  course: { ref: string | null; name: string; place: string };
  tee: PlayerRoundTee | null;
  holesPlayed: 9 | 18;
  format: string;
  /** Empty for a total-only round (History). */
  holes: PlayerRoundHole[];
  total: number;
  countsForHandicap: boolean;
  notCountedReason: string | null;
  differential: number | null;
  enteredBy: "player" | "organizer";
  status: "submitted";
}

export type PlayerRoundInput = Omit<PlayerRound, "total" | "countsForHandicap" | "notCountedReason" | "differential" | "status"> & { total?: number };

/** The Scoring sheet's card: one entry per hole, 1–18. */
export interface ScoredCard { strokes: number[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[] }

/** Deterministic ids: the same account + round always gets the same id, so a round can only be saved once. */
export const playerRoundId = (...parts: string[]) => parts.join(":");

/** Not own ball the whole way → never counts. Four-ball / best ball is own ball and does count. */
const TEAM_FORMAT = /scramble|alternate shot|alt[- ]?shot|foursome|shamble|greensome|chapman/i;

export function handicapEligibility(round: Pick<PlayerRound, "holesPlayed" | "format" | "tee" | "holes" | "total" | "enteredBy">):
  { counts: true; differential: number } | { counts: false; reason: string } {
  if (round.enteredBy === "organizer") return { counts: false, reason: "Entered by organizer" };
  if (TEAM_FORMAT.test(round.format)) return { counts: false, reason: `${round.format} isn't an own ball format` };
  if (round.holesPlayed === 9) return { counts: false, reason: "9-hole rounds will count once 9-hole scoring is added" };
  if (round.holes.length !== round.holesPlayed) return { counts: false, reason: "Not every hole was scored" };
  const { tee } = round;
  if (!tee || tee.rating === null || tee.slope === null || tee.slope < 55 || tee.slope > 155) return { counts: false, reason: "No course rating for this tee" };
  return { counts: true, differential: calculateDifferential(round.total, tee.rating, tee.slope) };
}

export function buildPlayerRound(input: PlayerRoundInput): PlayerRound {
  for (const hole of input.holes) {
    if (!Number.isInteger(hole.strokes) || hole.strokes < 1 || hole.strokes > 20) throw new Error(`Hole ${hole.number}: strokes must be 1–20.`);
  }
  const total = input.holes.length ? input.holes.reduce((sum, hole) => sum + hole.strokes, 0) : input.total;
  if (total === undefined || !Number.isInteger(total) || total < 18 || total > 200) throw new Error("A round needs a total between 18 and 200.");
  const { total: _ignored, ...rest } = input;
  void _ignored;
  const eligibility = handicapEligibility({ ...input, total });
  return {
    ...rest, total, status: "submitted",
    countsForHandicap: eligibility.counts,
    differential: eligibility.counts ? eligibility.differential : null,
    notCountedReason: eligibility.counts ? null : eligibility.reason,
  };
}

export function holesFromCard(card: ScoredCard, par: number[]): PlayerRoundHole[] {
  return card.strokes.map((strokes, index) => ({
    number: index + 1, par: par[index], strokes, putts: card.putts[index] ?? null,
    fairway: par[index] === 3 ? null : card.fairways[index] ?? null, green: card.greens[index] ?? null,
  }));
}

export function cardFromHoles(holes: PlayerRoundHole[]): ScoredCard {
  return { strokes: holes.map((h) => h.strokes), putts: holes.map((h) => h.putts), fairways: holes.map((h) => h.fairway), greens: holes.map((h) => h.green) };
}

/** Index from the most recent 20 counting rounds (newest first); low index replays them oldest first. */
export function handicapSummary(rounds: PlayerRound[]) {
  const counting = rounds.filter((round) => round.countsForHandicap && round.differential !== null)
    .sort((a, b) => b.datePlayed.localeCompare(a.datePlayed) || b.id.localeCompare(a.id));
  const newestFirst = counting.map((round) => round.differential as number);
  return { index: calculateHandicapIndex(newestFirst.slice(0, 20)), lowIndex: calculateLowIndex([...newestFirst].reverse()), counting: counting.length };
}
```

- [ ] **Step 4: Run it — expect PASS** (5 tests). Run: `npx tsx --test lib/platform/playerRounds.test.ts`
- [ ] **Step 5: Don't commit** (owner commits). Run `npx eslint lib/platform/playerRounds.ts lib/platform/playerRounds.test.ts` — expect no errors.

---

### Task 2: Privacy + History link requests

**Files:**
- Create: `lib/platform/playerRoundsPrivacy.ts`, `lib/platform/historyLinks.ts`
- Test: `lib/platform/playerRoundsPrivacy.test.ts`, `lib/platform/historyLinks.test.ts`

**Interfaces:**
- Consumes: `PlayerRound`, `buildPlayerRound`, `playerRoundId` (Task 1); `PastTrip` from `lib/platform/golfTripHistory.ts`.
- Produces: `RoundsVisibility`, `DEFAULT_ROUNDS_VISIBILITY`, `profileAccess({ viewerId, ownerId, visibility, playTogether }): { rounds: boolean; handicapIndex: boolean }`; `HistoryLinkRequest`, `historyLinkInput(trip, playerName, profileId)`, `requestHistoryLink(requests, input): HistoryLinkRequest[]`, `answerHistoryLink(requests, rounds, requestId, accept): { requests; rounds }`, `linkStatus(requests, historyTripId, playerName): HistoryLinkRequest | null`.

- [ ] **Step 1: Write the failing tests**

`lib/platform/playerRoundsPrivacy.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ROUNDS_VISIBILITY, profileAccess } from "./playerRoundsPrivacy";

test("new accounts are private", () => assert.equal(DEFAULT_ROUNDS_VISIBILITY, "private"));

test("owner sees everything; public shows everything to any signed-in account", () => {
  assert.deepEqual(profileAccess({ viewerId: "a", ownerId: "a", visibility: "private", playTogether: false }), { rounds: true, handicapIndex: true });
  assert.deepEqual(profileAccess({ viewerId: "b", ownerId: "a", visibility: "public", playTogether: false }), { rounds: true, handicapIndex: true });
});

test("private: trip-mates see only the handicap index; strangers see nothing", () => {
  assert.deepEqual(profileAccess({ viewerId: "b", ownerId: "a", visibility: "private", playTogether: true }), { rounds: false, handicapIndex: true });
  assert.deepEqual(profileAccess({ viewerId: "c", ownerId: "a", visibility: "private", playTogether: false }), { rounds: false, handicapIndex: false });
});
```

`lib/platform/historyLinks.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import type { PastTrip } from "./golfTripHistory";
import { answerHistoryLink, historyLinkInput, linkStatus, requestHistoryLink } from "./historyLinks";

const trip: PastTrip = {
  id: "h1", arrival: "2026-04-16", departure: "2026-04-19", name: "Desert Classic", place: "Scottsdale, AZ", players: ["J. Parker", "M. Chen"], championOverride: null,
  rounds: [
    { id: "r1", number: 1, date: "2026-04-17", course: { ref: null, name: "Desert Pines GC", place: "", par: 72 }, scores: { "J. Parker": 84, "M. Chen": 90 } },
    { id: "r2", number: 2, date: null, course: { ref: "og-9", name: "Saguaro Links", place: "", par: 71 }, scores: { "M. Chen": 88 } },
  ],
};

test("a request snapshots only that player's scored rounds", () => {
  const input = historyLinkInput(trip, "J. Parker", "dev-jake");
  assert.equal(input.rounds.length, 1);
  assert.deepEqual(input.rounds[0], { roundId: "r1", datePlayed: "2026-04-17", course: { ref: null, name: "Desert Pines GC", place: "" }, total: 84 });
  assert.throws(() => requestHistoryLink([], { ...input, rounds: [] }), /no scores/);
});

test("request → pending; a second request for the same name is refused until declined", () => {
  const requests = requestHistoryLink([], historyLinkInput(trip, "J. Parker", "dev-jake"));
  assert.equal(requests[0].status, "pending");
  assert.equal(linkStatus(requests, "h1", "J. Parker")?.profileId, "dev-jake");
  assert.throws(() => requestHistoryLink(requests, historyLinkInput(trip, "J. Parker", "dev-mike")), /waiting/);
  const declined = answerHistoryLink(requests, [], requests[0].id, false);
  assert.equal(declined.requests[0].status, "declined");
  assert.equal(declined.rounds.length, 0);
  assert.equal(linkStatus(declined.requests, "h1", "J. Parker"), null);
  assert.equal(requestHistoryLink(declined.requests, historyLinkInput(trip, "J. Parker", "dev-mike")).length, 2, "can ask again after a decline");
});

test("accept adds organizer-entered rounds that don't count; answering again changes nothing", () => {
  const requests = requestHistoryLink([], historyLinkInput(trip, "M. Chen", "dev-mike"));
  const accepted = answerHistoryLink(requests, [], requests[0].id, true);
  assert.equal(accepted.requests[0].status, "accepted");
  assert.deepEqual(accepted.rounds.map((r) => [r.source, r.enteredBy, r.total, r.countsForHandicap, r.datePlayed]),
    [["history", "organizer", 90, false, "2026-04-17"], ["history", "organizer", 88, false, "2026-04-16"]]);
  const again = answerHistoryLink(accepted.requests, accepted.rounds, requests[0].id, true);
  assert.equal(again.rounds.length, 2);
  assert.throws(() => requestHistoryLink(accepted.requests, historyLinkInput(trip, "M. Chen", "dev-cade")), /already linked/);
});
```

- [ ] **Step 2: Run both — expect FAIL** (missing modules).

Run: `npx tsx --test lib/platform/playerRoundsPrivacy.test.ts lib/platform/historyLinks.test.ts`

- [ ] **Step 3: Implement**

`lib/platform/playerRoundsPrivacy.ts`:

```ts
/** Settings → Privacy. Private: only you see your Rounds; people you play with still see your handicap index (games need it). */
export type RoundsVisibility = "public" | "private";
export const DEFAULT_ROUNDS_VISIBILITY: RoundsVisibility = "private";

export function profileAccess({ viewerId, ownerId, visibility, playTogether }: {
  viewerId: string; ownerId: string; visibility: RoundsVisibility; playTogether: boolean;
}): { rounds: boolean; handicapIndex: boolean } {
  if (viewerId === ownerId || visibility === "public") return { rounds: true, handicapIndex: true };
  return { rounds: false, handicapIndex: playTogether };
}
```

`lib/platform/historyLinks.ts`:

```ts
import type { PastTrip } from "./golfTripHistory";
import { buildPlayerRound, playerRoundId, type PlayerRound } from "./playerRounds";

/**
 * History → link a typed past-trip name to an account. The player must Accept before anything reaches their profile;
 * accepted rounds are "Entered by organizer" and never count toward handicap. The request carries a snapshot of the
 * player's rounds, so what they accept is exactly what they were shown.
 */
export interface HistoryLinkRequest {
  id: string;
  historyTripId: string;
  tripName: string;
  arrival: string;
  playerName: string;
  profileId: string;
  status: "pending" | "accepted" | "declined";
  rounds: { roundId: string; datePlayed: string | null; course: { ref: string | null; name: string; place: string }; total: number }[];
}
export type HistoryLinkInput = Omit<HistoryLinkRequest, "id" | "status">;

export function historyLinkInput(trip: PastTrip, playerName: string, profileId: string): HistoryLinkInput {
  return {
    historyTripId: trip.id, tripName: trip.name, arrival: trip.arrival, playerName, profileId,
    rounds: trip.rounds.filter((round) => round.scores[playerName] !== undefined).map((round) => ({
      roundId: round.id, datePlayed: round.date, course: { ref: round.course.ref, name: round.course.name, place: round.course.place }, total: round.scores[playerName],
    })),
  };
}

/** The live request for this past-trip name (pending or accepted); declined ones don't count. */
export function linkStatus(requests: HistoryLinkRequest[], historyTripId: string, playerName: string) {
  return requests.find((r) => r.historyTripId === historyTripId && r.playerName === playerName && r.status !== "declined") ?? null;
}

export function requestHistoryLink(requests: HistoryLinkRequest[], input: HistoryLinkInput): HistoryLinkRequest[] {
  if (!input.rounds.length) throw new Error(`${input.playerName} has no scores to link yet.`);
  const live = linkStatus(requests, input.historyTripId, input.playerName);
  if (live) throw new Error(live.status === "pending" ? `${input.playerName} is waiting on a request already.` : `${input.playerName} is already linked.`);
  return [...requests, { ...input, id: `link:${input.historyTripId}:${input.playerName}:${requests.length + 1}`, status: "pending" }];
}

/** Only a pending request can be answered; Accept adds the snapshot rounds (skipping any already saved). */
export function answerHistoryLink(requests: HistoryLinkRequest[], rounds: PlayerRound[], requestId: string, accept: boolean) {
  const request = requests.find((r) => r.id === requestId);
  if (!request || request.status !== "pending") return { requests, rounds };
  const nextRequests = requests.map((r) => r.id === requestId ? { ...r, status: accept ? "accepted" as const : "declined" as const } : r);
  if (!accept) return { requests: nextRequests, rounds };
  const saved = new Set(rounds.map((r) => r.id));
  const added = request.rounds.map((r) => buildPlayerRound({
    id: playerRoundId("history", request.historyTripId, r.roundId, request.profileId), profileId: request.profileId, source: "history",
    historyTripId: request.historyTripId, datePlayed: r.datePlayed ?? request.arrival, course: r.course, tee: null,
    holesPlayed: 18, format: "Stroke play", holes: [], total: r.total, enteredBy: "organizer",
  })).filter((r) => !saved.has(r.id));
  return { requests: nextRequests, rounds: [...rounds, ...added] };
}
```

- [ ] **Step 4: Run — expect PASS** (3 + 3 tests). Run: `npx tsx --test lib/platform/playerRoundsPrivacy.test.ts lib/platform/historyLinks.test.ts`
- [ ] **Step 5: Lint, don't commit.** `npx eslint lib/platform/playerRoundsPrivacy.ts lib/platform/historyLinks.ts`

---

### Task 3: Mock accounts + dev player-rounds store

**Files:**
- Create: `lib/dev/devAccounts.ts`, `lib/dev/devPlayerRounds.ts`, `components/dev/useDevPlayerRounds.ts`
- Test: `lib/dev/devPlayerRounds.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `GolfMatchPreview` from `lib/platform/golfTripPreviewFixture.ts`.
- Produces:
  - `DevAccount`, `DEV_ACCOUNTS`, `DEFAULT_DEV_ACCOUNT = "dev-cade"`, `devAccount(id)`, `devPlayTogether(a, b)`.
  - `DevRoundsState { rounds; visibility: Record<string, RoundsVisibility>; linkRequests }`, `DevRoundsAction`, `devRoundsReducer(state, action)`, `seedDevRounds()`, `parseDevRounds(text: string | null)`, `DEV_TRIP_ID = "dev-trip"`, `DEV_TRIP_TEE`, `devTripRoundId(match)`, `devTripRound(match, profileId, card)`, `visibilityOf(state, profileId)`.
  - Hook: `useDevPlayerRounds(): DevRoundsState`, `dispatchDevRounds(action): void`.

- [ ] **Step 1: Write the failing test** — `lib/dev/devPlayerRounds.test.ts`

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { GOLF_MATCH_PREVIEW_SINGLES } from "@/lib/platform/golfTripPreviewFixture";
import { DEV_TRIP_ID, devRoundsReducer, devTripRound, parseDevRounds, seedDevRounds, visibilityOf } from "./devPlayerRounds";

const match = GOLF_MATCH_PREVIEW_SINGLES;
const card = { strokes: match.par.map((p) => p + 1), putts: match.par.map(() => 2), fairways: match.par.map(() => "center" as const), greens: match.par.map(() => "center" as const) };

test("submitting a trip round saves one round for that account; submitting again changes nothing", () => {
  const round = devTripRound(match, "dev-cade", card);
  assert.equal(round.tripId, DEV_TRIP_ID);
  assert.equal(round.total, match.par.reduce((a, b) => a + b, 0) + 18);
  const once = devRoundsReducer(seedDevRounds(), { type: "saveRound", round });
  const twice = devRoundsReducer(once, { type: "saveRound", round: { ...round, total: 60 } });
  assert.equal(twice.rounds.filter((r) => r.id === round.id).length, 1);
  assert.equal(twice.rounds.find((r) => r.id === round.id)?.total, round.total, "locked after submit");
});

test("privacy defaults to private and can be switched", () => {
  const seed = seedDevRounds();
  assert.equal(visibilityOf(seed, "dev-cade"), "private");
  assert.equal(visibilityOf(devRoundsReducer(seed, { type: "setVisibility", profileId: "dev-cade", visibility: "public" }), "dev-cade"), "public");
});

test("seed gives Cade 2 counting rounds and Jake 3, so one trip round gives Cade an index", () => {
  const seed = seedDevRounds();
  assert.equal(seed.rounds.filter((r) => r.profileId === "dev-cade" && r.countsForHandicap).length, 2);
  assert.equal(seed.rounds.filter((r) => r.profileId === "dev-jake" && r.countsForHandicap).length, 3);
});

test("empty, corrupt or wrong-shaped saved data falls back to the seed", () => {
  assert.deepEqual(parseDevRounds(null), seedDevRounds());
  assert.deepEqual(parseDevRounds("{not json"), seedDevRounds());
  assert.deepEqual(parseDevRounds(JSON.stringify({ rounds: "x" })), seedDevRounds());
  const saved = devRoundsReducer(seedDevRounds(), { type: "setVisibility", profileId: "dev-jake", visibility: "public" });
  assert.deepEqual(parseDevRounds(JSON.stringify(saved)), saved);
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npx tsx --test lib/dev/devPlayerRounds.test.ts`

- [ ] **Step 3: Implement**

`lib/dev/devAccounts.ts`:

```ts
/** DEV ONLY: mock accounts for the player-rounds preview. Alex isn't on the trip (tests Private for strangers). */
export interface DevAccount { id: string; name: string; onTrip: boolean }
export const DEV_ACCOUNTS: DevAccount[] = [
  { id: "dev-cade", name: "Cade Barone", onTrip: true },
  { id: "dev-jake", name: "Jake Parker", onTrip: true },
  { id: "dev-mike", name: "Mike Chen", onTrip: true },
  { id: "dev-alex", name: "Alex Rivera", onTrip: false },
];
export const DEFAULT_DEV_ACCOUNT = "dev-cade";
export const devAccount = (id: string | undefined) => DEV_ACCOUNTS.find((account) => account.id === id) ?? DEV_ACCOUNTS[0];
export const devPlayTogether = (a: string, b: string) => devAccount(a).onTrip && devAccount(b).onTrip;
```

`lib/dev/devPlayerRounds.ts`:

```ts
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { answerHistoryLink, requestHistoryLink, type HistoryLinkInput, type HistoryLinkRequest } from "@/lib/platform/historyLinks";
import { buildPlayerRound, holesFromCard, playerRoundId, type PlayerRound, type ScoredCard } from "@/lib/platform/playerRounds";
import { DEFAULT_ROUNDS_VISIBILITY, type RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";

/**
 * DEV ONLY: every mock account's saved rounds, privacy and History link requests — the stand-in for Step 2's tables.
 * Pure reducer here; components/dev/useDevPlayerRounds.ts keeps it in sessionStorage so the trip, the dev profile and
 * Organizer settings → History all share it.
 */
export interface DevRoundsState { rounds: PlayerRound[]; visibility: Record<string, RoundsVisibility>; linkRequests: HistoryLinkRequest[] }
export type DevRoundsAction =
  | { type: "saveRound"; round: PlayerRound }
  | { type: "setVisibility"; profileId: string; visibility: RoundsVisibility }
  | { type: "requestLink"; input: HistoryLinkInput }
  | { type: "answerLink"; requestId: string; accept: boolean };

export const DEV_TRIP_ID = "dev-trip";
/** The preview's courses have no real tee data; this rated tee lets dev trip rounds count. */
export const DEV_TRIP_TEE = { name: "Blue", rating: 71.4, slope: 131 };

export const devTripRoundId = (match: GolfMatchPreview) => `round-${match.round}`;
export function devTripRound(match: GolfMatchPreview, profileId: string, card: ScoredCard): PlayerRound {
  return buildPlayerRound({
    id: playerRoundId("trip", DEV_TRIP_ID, devTripRoundId(match), profileId), profileId, source: "trip", tripId: DEV_TRIP_ID, tripRoundId: devTripRoundId(match),
    datePlayed: match.roundDate, course: { ref: null, name: match.course, place: "" }, tee: DEV_TRIP_TEE,
    holesPlayed: 18, format: match.format, holes: holesFromCard(card, match.par), enteredBy: "player",
  });
}

function personal(profileId: string, n: number, date: string, total: number): PlayerRound {
  return buildPlayerRound({
    id: playerRoundId("personal", profileId, String(n)), profileId, source: "personal", datePlayed: date,
    course: { ref: null, name: "Cedar Crest GC", place: "Dallas, TX" }, tee: { name: "White", rating: 70.1, slope: 124 },
    holesPlayed: 18, format: "Stroke play", holes: [], total, enteredBy: "player",
  });
}

/** Total-only seed rounds would fail "Not every hole was scored", so the seed fills an 18-hole card that adds up. */
function seedRound(profileId: string, n: number, date: string, total: number): PlayerRound {
  const base = personal(profileId, n, date, total);
  const strokes = Array.from({ length: 18 }, (_, i) => Math.floor(total / 18) + (i < total % 18 ? 1 : 0));
  return buildPlayerRound({ ...base, holes: strokes.map((s, i) => ({ number: i + 1, par: 4, strokes: s, putts: 2, fairway: null, green: null })) });
}

export function seedDevRounds(): DevRoundsState {
  return {
    rounds: [
      seedRound("dev-cade", 1, "2027-03-02", 84), seedRound("dev-cade", 2, "2027-03-16", 81),
      seedRound("dev-jake", 1, "2027-02-20", 92), seedRound("dev-jake", 2, "2027-03-06", 88), seedRound("dev-jake", 3, "2027-03-27", 90),
    ],
    visibility: {}, linkRequests: [],
  };
}

export const visibilityOf = (state: DevRoundsState, profileId: string) => state.visibility[profileId] ?? DEFAULT_ROUNDS_VISIBILITY;

export function devRoundsReducer(state: DevRoundsState, action: DevRoundsAction): DevRoundsState {
  switch (action.type) {
    case "saveRound": return state.rounds.some((r) => r.id === action.round.id) ? state : { ...state, rounds: [...state.rounds, action.round] };
    case "setVisibility": return { ...state, visibility: { ...state.visibility, [action.profileId]: action.visibility } };
    case "requestLink": return { ...state, linkRequests: requestHistoryLink(state.linkRequests, action.input) };
    case "answerLink": {
      const { requests, rounds } = answerHistoryLink(state.linkRequests, state.rounds, action.requestId, action.accept);
      return { ...state, linkRequests: requests, rounds };
    }
  }
}

/** sessionStorage text → state; anything unexpected → a fresh seed (never throws). */
export function parseDevRounds(text: string | null): DevRoundsState {
  try {
    const value = text ? JSON.parse(text) as Partial<DevRoundsState> : null;
    if (value && Array.isArray(value.rounds) && Array.isArray(value.linkRequests) && value.visibility && typeof value.visibility === "object") return value as DevRoundsState;
  } catch { /* fall through */ }
  return seedDevRounds();
}
```

Note: `requestLink` can throw (duplicate / no scores) — the caller catches and shows the message (Task 7).

`components/dev/useDevPlayerRounds.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";
import { devRoundsReducer, parseDevRounds, seedDevRounds, type DevRoundsAction, type DevRoundsState } from "@/lib/dev/devPlayerRounds";

/** DEV ONLY: one shared player-rounds store per browser tab (sessionStorage), read by the trip, dev profile and History. */
const KEY = "maroon-dev-player-rounds-v1";
const SEED = seedDevRounds();
const listeners = new Set<() => void>();
let state: DevRoundsState | null = null;

function current(): DevRoundsState {
  if (state) return state;
  try { state = parseDevRounds(sessionStorage.getItem(KEY)); } catch { state = SEED; }
  return state;
}

/** Throws the reducer's error (e.g. a duplicate link request) so the caller can show it. */
export function dispatchDevRounds(action: DevRoundsAction) {
  state = devRoundsReducer(current(), action);
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: keep it in memory */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useDevPlayerRounds = () => useSyncExternalStore(subscribe, current, () => SEED);
```

- [ ] **Step 4: Run — expect PASS** (4 tests). Run: `npx tsx --test lib/dev/devPlayerRounds.test.ts`
- [ ] **Step 5: Lint + type check, don't commit.** `npx eslint lib/dev/devAccounts.ts lib/dev/devPlayerRounds.ts components/dev/useDevPlayerRounds.ts && npx tsc --noEmit -p .`

---

### Task 4: Simulator "Signed in as <mock account>"

**Files:**
- Modify: `lib/dev/simulator.ts` (`SimulatorState`, `DEFAULT_SIMULATOR_STATE`, `parseSimulatorConfig`)
- Modify: `lib/dev/simulatorRoutes.ts` (conditions on Golf Trip Active pages, settings pages and `/dev/profile`)
- Test: `lib/dev/simulator.test.ts` (add one test)

**Interfaces:**
- Consumes: `DEV_ACCOUNTS`, `DEFAULT_DEV_ACCOUNT` (Task 3).
- Produces: `SimulatorState.viewAs: string` (a `DEV_ACCOUNTS` id), default `"dev-cade"`; conditions `{ id: "view-as-<id>", label: "Signed in as <name>", state: { viewAs: "<id>" } }`.

- [ ] **Step 1: Write the failing test** — append to `lib/dev/simulator.test.ts`:

```ts
test("viewAs: defaults to Cade, accepts a mock account, rejects anything else", () => {
  assert.equal(DEFAULT_SIMULATOR_STATE.viewAs, "dev-cade");
  const config = (viewAs: unknown) => parseSimulatorConfig({ source: "mock", state: { ...DEFAULT_SIMULATOR_STATE, viewAs } });
  assert.equal(config("dev-jake")?.state.viewAs, "dev-jake");
  assert.equal(config("someone-else"), null);
  assert.ok(config(undefined), "older panels without viewAs still work");
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npx tsx --test lib/dev/simulator.test.ts`

- [ ] **Step 3: Implement**

In `lib/dev/simulator.ts`: add `import { DEFAULT_DEV_ACCOUNT, DEV_ACCOUNTS } from "./devAccounts";`; add to `SimulatorState`:

```ts
  /** Which mock account the preview is signed in as (player-rounds preview: trip submit, dev profile, History links). */
  viewAs: string;
```

Set `DEFAULT_SIMULATOR_STATE` to include `viewAs: DEFAULT_DEV_ACCOUNT`. In `parseSimulatorConfig`, after the `opponentCard` check:

```ts
  if (state.viewAs !== undefined && !DEV_ACCOUNTS.some((account) => account.id === state.viewAs)) return null;
```

and return `state: { ...(state as SimulatorState), viewAs: (state.viewAs as string | undefined) ?? DEFAULT_DEV_ACCOUNT }`.

In `lib/dev/simulatorRoutes.ts`: `import { DEV_ACCOUNTS } from "./devAccounts";` then, after the existing `if (page.navigation?.tab) page.conditions.push(...)` block inside the Golf Trip Active loop, add:

```ts
    if (page.navigation?.tab) page.conditions.push(...DEV_ACCOUNTS.map((account) => ({ id: `view-as-${account.id}`, label: `Signed in as ${account.name}`, state: { viewAs: account.id } })));
```

and after the `settings` block:

```ts
  const profile = pages.find(page => page.path === "/dev/profile");
  if (profile) {
    profile.label = "Profile (player rounds)";
    profile.conditions = DEV_ACCOUNTS.map((account) => ({ id: `view-as-${account.id}`, label: `Signed in as ${account.name}`, state: { viewAs: account.id } }));
  }
```

(The settings pages copy `settings.conditions`, which already include the trip conditions — check after the change that "Signed in as …" shows on Organizer settings → History; if not, push the same four conditions onto `settings.conditions` before the `add(...)` calls.)

- [ ] **Step 4: Run — expect PASS.** Run: `npx tsx --test lib/dev/simulator.test.ts lib/dev/simulatorRoutes.test.ts 2>&1 | tail -8` (if `simulatorRoutes.test.ts` doesn't exist, run only the first). The known `playDemo` failure is unrelated.
- [ ] **Step 5: Type check, don't commit.** `npx tsc --noEmit -p .`

---

### Task 5: Trip Submit & Save → saved round (and read back)

**Files:**
- Modify: `components/platform/GolfTripScoring.tsx` (props, initial state, submit button)
- Modify: `components/platform/GolfTripHome.tsx` (pass-through props + scoring `key`)
- Modify: `app/dev/tournament/TournamentDataPreview.tsx` (wire the store)

**Interfaces:**
- Consumes: `ScoredCard`, `ShotResult`, `cardFromHoles`, `playerRoundId` (Task 1); `useDevPlayerRounds`, `dispatchDevRounds`, `devTripRound`, `devTripRoundId`, `DEV_TRIP_ID` (Task 3); `config.state.viewAs` (Task 4).
- Produces: `GolfTripScoring` props `onSubmit?: (card: ScoredCard) => void; submittedCard?: ScoredCard`; `GolfTripHome` props `onScoringSubmit?`, `submittedCard?`.

- [ ] **Step 1: GolfTripScoring.** Replace `type Direction = "up" | "left" | "center" | "right" | "down";` with `type Direction = ShotResult;` and add `import type { ScoredCard, ShotResult } from "@/lib/platform/playerRounds";`. Add to the props destructure and type: `onSubmit, submittedCard` / `onSubmit?: (card: ScoredCard) => void; /** A round already saved for this player: the card opens locked as Submitted. */ submittedCard?: ScoredCard;`. Change the initial states:

```ts
  const [holes, setHoles] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.strokes[i] ?? initialHoles?.[i] ?? null));
  const [putts, setPutts] = useState<(number | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.putts[i] ?? prefill?.putts[i] ?? null));
  const [fairways, setFairways] = useState<(Direction | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.fairways[i] ?? prefill?.fairways[i] ?? null));
  const [greens, setGreens] = useState<(Direction | null)[]>(() => Array.from({ length: HOLES }, (_, i) => submittedCard?.greens[i] ?? prefill?.greens[i] ?? null));
  const [submitted, setSubmitted] = useState(Boolean(submittedCard));
```

Change the Submit Score button's `onClick` to:

```tsx
onClick={() => { setHoles(submittedHoles); setHolesCompetitor(submittedOpponentHoles); setSubmitted(true); setConfirmOpen(false);
  onSubmit?.({ strokes: submittedHoles.map((h) => h ?? 0), putts, fairways, greens }); }}
```

(`readyToSubmit` already guarantees every hole has strokes; `?? 0` only satisfies the type and `buildPlayerRound` would reject a 0.) Update the doc comment: "Submit & Save calls `onSubmit` with the card (the dev preview saves it as the player's round); `submittedCard` reopens a saved round locked."

- [ ] **Step 2: GolfTripHome.** Add to its props `onScoringSubmit?: (card: ScoredCard) => void; submittedCard?: ScoredCard;` (import the type), and on the `<GolfTripScoring …>` line add `onSubmit={onScoringSubmit} submittedCard={submittedCard}` and make the key `${scoringPrefill ? … : "blank"}-${submittedCard ? "saved" : "open"}` so a round loaded from the store remounts the card locked.

- [ ] **Step 3: TournamentDataPreview.** Add:

```tsx
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEFAULT_DEV_ACCOUNT } from "@/lib/dev/devAccounts";
import { DEV_TRIP_ID, devTripRound, devTripRoundId } from "@/lib/dev/devPlayerRounds";
import { cardFromHoles, playerRoundId, type ScoredCard } from "@/lib/platform/playerRounds";
```

and inside the component, after `data`:

```tsx
  // Player rounds (dev): Submit & Save saves this round once to the signed-in mock account; reopening shows it locked.
  const viewAs = config.state.viewAs ?? DEFAULT_DEV_ACCOUNT;
  const devRounds = useDevPlayerRounds();
  const match = data.previewMatch;
  const saved = match ? devRounds.rounds.find((r) => r.id === playerRoundId("trip", DEV_TRIP_ID, devTripRoundId(match), viewAs)) : undefined;
  const submittedCard = saved ? cardFromHoles(saved.holes) : undefined;
  const onScoringSubmit = (card: ScoredCard) => { if (match) dispatchDevRounds({ type: "saveRound", round: devTripRound(match, viewAs, card) }); };
```

Pass `onScoringSubmit={onScoringSubmit} submittedCard={submittedCard}` to `<GolfTripHome …>`.

- [ ] **Step 4: Verify.** `npx tsc --noEmit -p .` and `npx eslint components/platform/GolfTripScoring.tsx components/platform/GolfTripHome.tsx app/dev/tournament/TournamentDataPreview.tsx` — no errors (the one existing `aria-pressed` warning in GolfTripSettingsPreview is older). Run `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` — only the 3 known failures.
- [ ] **Step 5: Don't commit.**

---

### Task 6: Dev profile page — Rounds, handicap, Privacy, Requests

**Files:**
- Create: `app/dev/profile/page.tsx`, `components/dev/DevProfileRounds.tsx`

**Interfaces:**
- Consumes: `useSimulator` (`components/dev/SimulatorBridge`), `useDevPlayerRounds`, `dispatchDevRounds`, `visibilityOf`, `DEV_ACCOUNTS`, `devAccount`, `devPlayTogether`, `DEFAULT_DEV_ACCOUNT`, `handicapSummary`, `profileAccess`.
- Produces: route `/dev/profile` (auto-discovered by the simulator; Task 4 adds its conditions).

- [ ] **Step 1: Page** — `app/dev/profile/page.tsx`

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevProfileRounds } from "@/components/dev/DevProfileRounds";

export const metadata: Metadata = { title: "Profile preview | The Maroon", robots: { index: false, follow: false } };

/** DEV ONLY: Profile → Rounds from the shared player-rounds store, seen as the simulator's "Signed in as" account. */
export default function DevProfilePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DevProfileRounds />;
}
```

- [ ] **Step 2: Component** — `components/dev/DevProfileRounds.tsx`

```tsx
"use client";

import { useState } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEFAULT_DEV_ACCOUNT, DEV_ACCOUNTS, devAccount, devPlayTogether } from "@/lib/dev/devAccounts";
import { visibilityOf } from "@/lib/dev/devPlayerRounds";
import { handicapSummary } from "@/lib/platform/playerRounds";
import { profileAccess, type RoundsVisibility } from "@/lib/platform/playerRoundsPrivacy";

const SOURCE: Record<string, string> = { trip: "Golf trip", tournament: "Tournament", personal: "Logged myself", history: "Past trip" };
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const chip = (on: boolean) => `min-h-10 rounded-pill border px-4 font-condensed text-sm font-semibold ${on ? "border-maroon-900 bg-maroon-900 text-cream-50" : "border-ink-200 bg-white text-ink-900"}`;

/**
 * DEV ONLY profile preview. "Signed in as" = the simulator's viewAs account; "Profile of" picks whose profile to look at,
 * so Public / Private can be checked from someone else's side. Rounds + handicap come from the same saved rounds the
 * trip writes; Privacy and Requests show only on your own profile.
 */
export function DevProfileRounds() {
  const viewer = useSimulator()?.state.viewAs ?? DEFAULT_DEV_ACCOUNT;
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const owner = ownerId ?? viewer;
  const store = useDevPlayerRounds();
  const visibility = visibilityOf(store, owner);
  const access = profileAccess({ viewerId: viewer, ownerId: owner, visibility, playTogether: devPlayTogether(viewer, owner) });
  const rounds = store.rounds.filter((r) => r.profileId === owner).sort((a, b) => b.datePlayed.localeCompare(a.datePlayed));
  const summary = handicapSummary(rounds);
  const requests = store.linkRequests.filter((r) => r.profileId === owner && r.status === "pending");
  const isOwner = viewer === owner;

  return <main className="mx-auto max-w-[480px] px-4 py-8">
    <p className="font-condensed text-xs uppercase tracking-wide text-ink-500">Signed in as {devAccount(viewer).name}</p>
    <div role="group" aria-label="Profile of" className="mt-3 flex flex-wrap gap-2">
      {DEV_ACCOUNTS.map((account) => <button key={account.id} type="button" aria-pressed={owner === account.id} className={chip(owner === account.id)} onClick={() => setOwnerId(account.id)}>
        {account.id === viewer ? "Me" : account.name}</button>)}
    </div>
    <h1 className="mt-6 font-serif text-3xl font-bold text-ink-900">{devAccount(owner).name}</h1>

    <section aria-label="Handicap" className="mt-4 rounded-md border border-ink-200 bg-white p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Handicap index</h2>
      {access.handicapIndex ? <p className="mt-1 text-2xl font-bold text-maroon-900">{summary.index ?? "—"}
        <span className="ml-2 text-sm font-normal text-ink-600">{summary.index === null ? `Needs 3 counting rounds (${summary.counting} so far)` : `Low ${summary.lowIndex} · ${summary.counting} counting rounds`}</span></p>
        : <p className="mt-1 text-ink-600">This profile is private.</p>}
    </section>

    {isOwner && requests.length > 0 && <section aria-label="Requests" className="mt-4 rounded-md border border-gold-500 bg-cream-50 p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Requests</h2>
      {requests.map((request) => <div key={request.id} className="mt-3">
        <p className="text-ink-900"><strong>{request.tripName}</strong> ({day(request.arrival)}) wants to add {request.rounds.length} past {request.rounds.length === 1 ? "round" : "rounds"} to your profile as &ldquo;{request.playerName}&rdquo;.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className={chip(true)} onClick={() => dispatchDevRounds({ type: "answerLink", requestId: request.id, accept: true })}>Accept</button>
          <button type="button" className={chip(false)} onClick={() => dispatchDevRounds({ type: "answerLink", requestId: request.id, accept: false })}>Decline</button>
        </div>
      </div>)}
    </section>}

    <section aria-label="Rounds" className="mt-4 rounded-md border border-ink-200 bg-white p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Rounds</h2>
      {!access.rounds ? <p className="mt-1 text-ink-600">Rounds are private.</p>
        : rounds.length === 0 ? <p className="mt-1 text-ink-600">No rounds yet.</p>
        : <ol className="mt-2">{rounds.map((round) => <li key={round.id} className="flex items-start justify-between gap-3 border-t border-ink-100 py-3 first:border-t-0">
          <div>
            <p className="font-semibold text-ink-900">{round.course.name}</p>
            <p className="text-sm text-ink-600">{day(round.datePlayed)} · {SOURCE[round.source]}{round.enteredBy === "organizer" ? " · Entered by organizer" : ""}</p>
            <p className="text-sm text-ink-500">{round.countsForHandicap ? `Counts · differential ${round.differential}` : `Not counted · ${round.notCountedReason}`}</p>
          </div>
          <p className="text-xl font-bold text-maroon-900">{round.total}</p>
        </li>)}</ol>}
    </section>

    {isOwner && <section aria-label="Privacy" className="mt-4 rounded-md border border-ink-200 bg-white p-4">
      <h2 className="font-condensed text-sm font-semibold uppercase tracking-wide text-ink-500">Privacy</h2>
      <p className="mt-1 text-sm text-ink-600">{visibility === "public" ? "Anyone signed in can see your rounds and handicap." : "Only you see your rounds. People you play with still see your handicap index."}</p>
      <div className="mt-2 flex gap-2">
        {(["public", "private"] as RoundsVisibility[]).map((value) => <button key={value} type="button" aria-pressed={visibility === value} className={chip(visibility === value)}
          onClick={() => dispatchDevRounds({ type: "setVisibility", profileId: owner, visibility: value })}>{value === "public" ? "Public" : "Private"}</button>)}
      </div>
    </section>}
  </main>;
}
```

Note: if `gold-500`, `ink-100` or `rounded-pill` aren't defined Tailwind tokens (check `app/globals.css` theme), swap for the closest existing ones used in `app/settings/page.tsx` (`border-ink-200`, `rounded-md`, `rounded-pill` is used there).

- [ ] **Step 3: Verify.** `npx tsc --noEmit -p .`; `npx eslint app/dev/profile/page.tsx components/dev/DevProfileRounds.tsx`; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/dev/profile` → `200`.
- [ ] **Step 4: Don't commit.**

---

### Task 7: History → Link to account

**Files:**
- Modify: `components/platform/GolfTripHistory.tsx` (new optional `linking` prop → `PastTripView` → `PastPlayersTab`)
- Modify: `components/platform/GolfTripSettingsPreview.tsx` (build `linking` from the dev store)
- Modify: `components/platform/GolfTripHistory.module.css` (two small classes)

**Interfaces:**
- Consumes: `historyLinkInput`, `linkStatus` (Task 2); `useDevPlayerRounds`, `dispatchDevRounds`, `DEV_ACCOUNTS`, `devAccount` (Task 3).
- Produces: `export interface HistoryLinking { accounts: { id: string; name: string }[]; statusFor: (trip: PastTrip, playerName: string) => { status: "pending" | "accepted"; accountName: string } | null; request: (trip: PastTrip, playerName: string, profileId: string) => string | null }` — `request` returns an error message or null.

- [ ] **Step 1: GolfTripHistory.** Export `HistoryLinking` (above) and add `linking?: HistoryLinking` to `GolfTripHistory`'s props; pass it `<PastTripView … linking={linking} />` → `<PastPlayersTab … linking={linking} />`. In `PastPlayersTab` add state `const [linkingName, setLinkingName] = useState<string | null>(null); const [linkError, setLinkError] = useState<string | null>(null);` and replace each player row with:

```tsx
    <div>{trip.players.map((player) => {
      const link = linking?.statusFor(trip, player) ?? null;
      return <div key={player}>
        <div className={styles.playerRow}>
          <span>{player}{link && <span className={styles.linkStatus}>{link.status === "accepted" ? `Linked to ${link.accountName}` : `Waiting for ${link.accountName}`}</span>}</span>
          <span className={styles.rowActions}>
            {linking && !link && <button type="button" className={styles.pick} onClick={() => { setLinkError(null); setLinkingName(linkingName === player ? null : player); }}>Link to account</button>}
            <button type="button" className={styles.iconButton} aria-label={`Remove ${player}`} onClick={() => setConfirmRemove(player)}><Trash2 size={18} aria-hidden /></button>
          </span>
        </div>
        {linking && linkingName === player && <div className={styles.pickRow} role="group" aria-label={`Link ${player} to an account`}>
          {linking.accounts.map((account) => <button key={account.id} type="button" className={styles.pick}
            onClick={() => { const error = linking.request(trip, player, account.id); setLinkError(error); if (!error) setLinkingName(null); }}>{account.name}</button>)}
        </div>}
      </div>;
    })}</div>
    {linkError && <p className={styles.error} role="alert">{linkError}</p>}
    {linking && <p className={styles.note}>Linking sends that player a request. Their past rounds reach their profile only after they accept, and don&apos;t count toward handicap.</p>}
```

Add to `GolfTripHistory.module.css`:

```css
.linkStatus{display:block;color:#dcc495;font:600 12px var(--font-barlow),sans-serif}
.rowActions{display:flex;align-items:center;gap:6px}
```

- [ ] **Step 2: GolfTripSettingsPreview.** Add imports `import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds"; import { DEV_ACCOUNTS, devAccount } from "@/lib/dev/devAccounts"; import { historyLinkInput, linkStatus } from "@/lib/platform/historyLinks";` and `type HistoryLinking` from `./GolfTripHistory`. Inside the component:

```tsx
  // History → Link to account (dev): requests go to the shared player-rounds store; the player answers on /dev/profile.
  const devRounds = useDevPlayerRounds();
  const historyLinking: HistoryLinking = {
    accounts: DEV_ACCOUNTS.map(({ id, name }) => ({ id, name })),
    statusFor: (trip, playerName) => {
      const link = linkStatus(devRounds.linkRequests, trip.id, playerName);
      return link && link.status !== "declined" ? { status: link.status, accountName: devAccount(link.profileId).name } : null;
    },
    request: (trip, playerName, profileId) => {
      try { dispatchDevRounds({ type: "requestLink", input: historyLinkInput(trip, playerName, profileId) }); return null; }
      catch (error) { return error instanceof Error ? error.message : "Couldn't send the request."; }
    },
  };
```

and pass `linking={historyLinking}` to `<GolfTripHistory …>`.

- [ ] **Step 3: Verify.** `npx tsc --noEmit -p .`; `npx eslint components/platform/GolfTripHistory.tsx components/platform/GolfTripSettingsPreview.tsx`; `npx tsx --test lib/platform/golfTripHistory.test.ts lib/platform/historyLinks.test.ts`.
- [ ] **Step 4: Don't commit.**

---

### Task 8: End-to-end check + spec status

**Files:**
- Create (temporary, deleted after): `_tmp-player-rounds-check.mjs` in the repo root (Playwright resolves from the repo's `node_modules`)
- Modify: `project_specs.md` (status line of the Player rounds round)

- [ ] **Step 1: Browser walk-through** (dev server already on `http://localhost:3001`). Script:

```js
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
// 1. Profile before: Cade has 2 counting rounds → no index yet.
await page.goto("http://localhost:3001/dev/profile", { waitUntil: "networkidle" });
console.log("before:", await page.getByRole("region", { name: "Handicap" }).innerText());
// 2. Trip: end-of-round card that matches → Submit & Save.
//    Open http://localhost:3001/dev, pick "Golf Trip Active" → Home, conditions "Mock golf trip data" + "End of round, unsubmitted — scores match",
//    pull up Scoring → Card → Submit & Save → Submit Score. (Drive this with clicks inside the simulator iframe; selectors: button "Submit & Save", button "Submit Score".)
// 3. Profile after: a "Golf trip" round, "Counts · differential …", index shown.
// 4. Privacy: as Cade set Private; switch "Signed in as Alex Rivera" → Cade's profile shows "Rounds are private." and "This profile is private.";
//    as Jake (trip-mate) → handicap index visible, rounds private. Set Public → Alex sees rounds.
// 5. History: Organizer settings → History → Desert Classic → Players → "Link to account" on a player → Jake Parker → "Waiting for Jake Parker";
//    a second link on the same name is refused; signed in as Jake, /dev/profile shows the request → Accept → past rounds "Entered by organizer · Not counted".
console.log("errors:", JSON.stringify(errors));
await browser.close();
```

Steps 2, 4 and 5 go through the simulator at `/dev` (the frame shares `sessionStorage` with `/dev/profile` in the same tab). If driving the iframe headless is unreliable, open the frame's own URLs (`/dev/tournament?…` the simulator uses — read `components/dev/DevSimulator.tsx` for how it builds the frame `src` and posts config) in one page so storage is shared. Expected: every check prints the right text and `errors: []`. Delete the temp script afterwards.

- [ ] **Step 2: Full checks.** `npx tsc --noEmit -p .` (exit 0); `npx eslint` on every file touched (no errors); `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → only the 3 known older failures.
- [ ] **Step 3: Spec status.** In `project_specs.md` change the heading's `(spec 2026-10-06, approved 2026-10-06)` to `(spec 2026-10-06, approved 2026-10-06; Step 1 built 2026-10-06 — dev preview)`, and add one line under "Built in steps": "Step 1 notes: 9-hole rounds saved but not counted until Step 2; link requests show in a Requests card on /dev/profile (no notification inbox yet)."
- [ ] **Step 4: Don't commit.** Report to the owner in the CLAUDE.md format (What I just did / What you need to do / Why / Next step / Errors), including the two deviations.
