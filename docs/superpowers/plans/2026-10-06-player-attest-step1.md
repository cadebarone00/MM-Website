# Player & Attest — Step 1 add-on (dev preview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Player & Attest add-on in the dev preview: groups with automatic attesters, the full-screen submit animation, saving to the existing dev player-rounds store, trip leaderboard + trip stats from saved rounds, Start / End round, organizer override + push-through with a change log, and remove-from-profile.

**Architecture:** Pure, tested functions in `lib/platform/` (attesters, live cards, score edits, visibility, trip stats, round state) sit on top of the existing `PlayerRound` model, which only gains optional fields. The existing dev store (`lib/dev/devPlayerRounds.ts` + `components/dev/useDevPlayerRounds.ts`, sessionStorage) gains live cards, groups, round state and the push-through setting, and is what the trip preview, Organizer settings and `/dev/profile` share. No database (that is Step 2, separate approval).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS modules, `node:test` via `tsx`.

**Spec:** `project_specs.md` → "Round: Player rounds — one saved round per account…" and its "#### Add-on: Player & Attest…" (approved 2026-10-06). Read both before starting.

## Global Constraints

- Do not change the Player rounds architecture: `PlayerRound` stays the one locked saved round; only **optional** fields are added; nothing is renamed or removed.
- Dev preview only. No SQL, no Supabase, no server code. Claude never runs SQL.
- Another terminal works in this same folder. Never `git stash`, `git checkout -- <file>`, `git reset`. Before Task 1, `git status` must show the other terminal's player-rounds work committed (`lib/platform/playerRounds.ts`, `lib/dev/devPlayerRounds.ts`, `components/platform/GolfTripHome.tsx`, `app/dev/tournament/TournamentDataPreview.tsx` not modified). If they are still modified, stop and tell the owner.
- Commit only the files the task lists (`git add <paths>`), never `git add -A`. Commit only if the owner has said commits are OK for this build.
- New tests go in **new** test files (the other terminal edits the existing ones).
- Match surrounding code style: dense one-line JSX, short comments explaining why, no new libraries.
- Keep existing labels and wording in the other terminal's screens (e.g. `/dev/profile`'s source labels).
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Commands: tests `npx tsx --test <file>`; all tests `npm test`; types `npx tsc --noEmit -p .`; lint `npx eslint <files>`; app at `http://localhost:3001` (already running; do not start a second server).

## Review Focus

1. **Live card save loop** — the scoring sheet reports its card on every change; saving an identical card must return the same store state so the page doesn't re-render forever (Task 7 test).
2. **Old saved preview data** — a browser tab with the previous store shape (no live cards / groups / round state) must keep its saved rounds, not crash or wipe them (Task 7 test).
3. **Override on a removed or counting round** — the round stays removed from the profile, still counts for handicap, and its differential is recomputed (Task 4 test).
4. **Push-through refused** when a mismatched hole has no pick, the reason is blank, or the organizer setting is off (Tasks 4 and 7 tests).
5. **Double submit** — pushing through or submitting a round that's already saved never creates a second round (Task 7 test).

---

### Task 1: Optional add-on fields on `PlayerRound` (penalties, group, visibility, removed, edits)

**Files:**
- Modify: `lib/platform/playerRounds.ts`
- Test: `lib/platform/playerRoundsAddon.test.ts` (new)

**Interfaces:**
- Produces: `HolePenalties`, `EditableField`, `ScoreEdit` types; `PlayerRoundHole.penalties?`, `ScoredCard.penalties?`, `PlayerRound.groupId? / visibility? / removedFromProfile? / edits?`; `handicapSummary` ignores removed rounds.

- [ ] **Step 1: Write the failing test**

```ts
// lib/platform/playerRoundsAddon.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, cardFromHoles, handicapSummary, holesFromCard, type PlayerRound } from "./playerRounds.ts";

const par = Array<number>(18).fill(4);
const holesFor = (total: number) => Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokes: Math.floor(total / 18) + (i < total % 18 ? 1 : 0), putts: 2, fairway: null, green: null }));
const round = (id: string, total: number, extra: Partial<PlayerRound> = {}): PlayerRound => buildPlayerRound({
  id, profileId: "p1", source: "trip", tripId: "t", tripRoundId: "round-1", datePlayed: `2027-04-${10 + Number(id.slice(-1))}`,
  course: { ref: null, name: "Pine", place: "" }, tee: { name: "Blue", rating: 71.4, slope: 131 }, holesPlayed: 18, format: "Stroke play",
  enteredBy: "player", holes: holesFor(total), ...extra,
});

test("penalties go from the card to the saved holes and back", () => {
  const card = { strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => "center" as const),
    penalties: par.map((_, i) => ({ fairway: i === 2, green: false })) };
  const holes = holesFromCard(card, par);
  assert.deepEqual(holes[2].penalties, { fairway: true, green: false });
  assert.deepEqual(cardFromHoles(holes).penalties?.[2], { fairway: true, green: false });
});

test("a card without penalties saves holes without them (older rounds keep their shape)", () => {
  const holes = holesFromCard({ strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => null) }, par);
  assert.equal("penalties" in holes[0], false);
  assert.equal(cardFromHoles(holes).penalties, undefined);
});

test("optional add-on fields pass through buildPlayerRound", () => {
  const saved = round("r1", 80, { groupId: "g1", removedFromProfile: true, edits: [] });
  assert.equal(saved.groupId, "g1");
  assert.equal(saved.removedFromProfile, true);
  assert.equal(saved.countsForHandicap, true);
});

test("a round removed from the profile no longer counts toward the handicap", () => {
  const rounds = [round("r1", 80), round("r2", 82), round("r3", 84), round("r4", 70, { removedFromProfile: true })];
  assert.equal(handicapSummary(rounds).counting, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/platform/playerRoundsAddon.test.ts`
Expected: FAIL (type errors / `penalties` undefined, `counting` is 4).

- [ ] **Step 3: Implement**

In `lib/platform/playerRounds.ts`:

1. Add the import at the top: `import type { RoundsVisibility } from "./playerRoundsPrivacy";`
2. After `export type RoundSource …` add:

```ts
/** Penalty taps on the Scoring sheet (fairway / green). */
export interface HolePenalties { fairway: boolean; green: boolean }
/** Organizer change log (Player & Attest add-on, decisions 9–10). */
export type EditableField = "strokes" | "putts" | "fairway" | "green";
export interface ScoreEdit { hole: number; field: EditableField; from: number | ShotResult | null; to: number | ShotResult | null; byProfileId: string; at: string; reason: string; kind: "override" | "pushThrough" }
```

3. `PlayerRoundHole`: add `; penalties?: HolePenalties` at the end of the interface.
4. `PlayerRound`: add after `status: "submitted";`

```ts
  /** The group this round was played in (Player & Attest); absent for History and older rounds. */
  groupId?: string;
  /** Personal rounds only: who else may see it (add-on decision 11). */
  visibility?: RoundsVisibility;
  /** Removed by the player (add-on decision 15): gone from their Rounds, Stats and handicap; the trip keeps it. */
  removedFromProfile?: boolean;
  /** Organizer overrides / push-throughs, oldest first. */
  edits?: ScoreEdit[];
```

5. `ScoredCard`: add `; penalties?: HolePenalties[]` at the end.
6. `holesFromCard`: inside the returned object add `...(card.penalties ? { penalties: card.penalties[index] ?? { fairway: false, green: false } } : {}),`
7. `cardFromHoles`: return `{ …existing…, ...(holes.some((h) => h.penalties) ? { penalties: holes.map((h) => h.penalties ?? { fairway: false, green: false }) } : {}) }`
8. `handicapSummary`: change the filter to `rounds.filter((round) => !round.removedFromProfile && round.countsForHandicap && round.differential !== null)`.

- [ ] **Step 4: Run tests**

Run: `npx tsx --test lib/platform/playerRoundsAddon.test.ts lib/platform/playerRounds.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/platform/playerRounds.ts lib/platform/playerRoundsAddon.test.ts
git commit -m "Player rounds: optional penalties, group, visibility, removed and edits fields"
```

---

### Task 2: Groups and automatic attesters

**Files:**
- Create: `lib/platform/roundGroups.ts`
- Test: `lib/platform/roundGroups.test.ts`

**Interfaces:**
- Consumes: `RoundSource` (Task 1 file), `RoundsVisibility`.
- Produces:
  - `interface GroupPlayerInput { profileId: string; side?: "left" | "right" }`
  - `interface RoundGroupPlayer { profileId: string; attesterProfileId: string | null }`
  - `interface RoundGroup { id; source: "trip" | "tournament" | "personal"; tripId?; tripRoundId?; course: { ref: string | null; name: string; place: string }; datePlayed: string; players: RoundGroupPlayer[]; startedBy: string; visibility?: RoundsVisibility }`
  - `assignAttesters(players: GroupPlayerInput[]): RoundGroupPlayer[]`
  - `groupTripPlayers(profileIds: string[], size?: number): string[][]`
  - `swapAttester(players: RoundGroupPlayer[], profileId: string, attesterProfileId: string): RoundGroupPlayer[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/platform/roundGroups.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignAttesters, groupTripPlayers, swapAttester } from "./roundGroups.ts";

const ids = (...names: string[]) => names.map((profileId) => ({ profileId }));
const attesterOf = (players: ReturnType<typeof assignAttesters>) => Object.fromEntries(players.map((p) => [p.profileId, p.attesterProfileId]));

test("2 players attest each other", () => assert.deepEqual(attesterOf(assignAttesters(ids("a", "b"))), { a: "b", b: "a" }));
test("3 players go in a circle: a attests b, b attests c, c attests a", () =>
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c"))), { b: "a", c: "b", a: "c" }));
test("4 players are two pairs: 1 ↔ 2, 3 ↔ 4", () =>
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c", "d"))), { a: "b", b: "a", c: "d", d: "c" }));
test("5 players go in a circle", () =>
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c", "d", "e"))), { a: "e", b: "a", c: "b", d: "c", e: "d" }));
test("a solo player has no attester", () => assert.deepEqual(assignAttesters(ids("a")), [{ profileId: "a", attesterProfileId: null }]));
test("a competitive group pairs each player with someone on the other side, never a teammate", () => {
  const players = [{ profileId: "l1", side: "left" as const }, { profileId: "l2", side: "left" as const }, { profileId: "r1", side: "right" as const }, { profileId: "r2", side: "right" as const }];
  assert.deepEqual(attesterOf(assignAttesters(players)), { l1: "r1", r1: "l1", l2: "r2", r2: "l2" });
});
test("players keep their order in the result", () => assert.deepEqual(assignAttesters(ids("c", "a")).map((p) => p.profileId), ["c", "a"]));
test("the same player twice is refused", () => assert.throws(() => assignAttesters(ids("a", "a")), /only be in a group once/));

test("trip players are grouped in fours, in order; a lone leftover joins the group before it", () => {
  const n = (count: number) => Array.from({ length: count }, (_, i) => `p${i + 1}`);
  assert.deepEqual(groupTripPlayers(n(4)).map((g) => g.length), [4]);
  assert.deepEqual(groupTripPlayers(n(5)).map((g) => g.length), [5]);
  assert.deepEqual(groupTripPlayers(n(6)).map((g) => g.length), [4, 2]);
  assert.deepEqual(groupTripPlayers(n(9)).map((g) => g.length), [4, 5]);
  assert.deepEqual(groupTripPlayers(n(2))[0], ["p1", "p2"]);
  assert.deepEqual(groupTripPlayers([]), []);
});

test("swapping an attester: allowed to another group member, never yourself or an outsider", () => {
  const players = assignAttesters(ids("a", "b", "c"));
  assert.equal(attesterOf(swapAttester(players, "a", "b")).a, "b");
  assert.throws(() => swapAttester(players, "a", "a"), /can't attest themselves/);
  assert.throws(() => swapAttester(players, "a", "z"), /isn't in this group/);
  assert.throws(() => swapAttester(players, "z", "a"), /isn't in this group/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/platform/roundGroups.test.ts`
Expected: FAIL with "Cannot find module './roundGroups.ts'".

- [ ] **Step 3: Implement**

```ts
// lib/platform/roundGroups.ts
import type { RoundSource } from "./playerRounds";
import type { RoundsVisibility } from "./playerRoundsPrivacy";

/**
 * Player & Attest (project_specs.md add-on): the golfers playing one round together, and who keeps whose score.
 * Every player keeps their own score; their attester keeps the same player's strokes, and the two must match.
 */
export interface GroupPlayerInput { profileId: string; side?: "left" | "right" }
export interface RoundGroupPlayer { profileId: string; attesterProfileId: string | null }
export interface RoundGroup {
  id: string;
  source: Exclude<RoundSource, "history">;
  tripId?: string;
  tripRoundId?: string;
  course: { ref: string | null; name: string; place: string };
  datePlayed: string;
  players: RoundGroupPlayer[];
  startedBy: string;
  /** Personal rounds only. */
  visibility?: RoundsVisibility;
}

/**
 * Who attests whom, picked automatically: 2 = each other; 4 = two pairs (1 ↔ 2, 3 ↔ 4); 3 or 5 = a circle (1 attests 2,
 * 2 attests 3, … the last attests 1); solo = nobody. A competitive group (two even sides) pairs opponents, never teammates.
 */
export function assignAttesters(players: GroupPlayerInput[]): RoundGroupPlayer[] {
  const ids = players.map((p) => p.profileId);
  if (new Set(ids).size !== ids.length) throw new Error("A player can only be in a group once.");
  const attester = new Map<string, string | null>(ids.map((id) => [id, null]));
  const pair = (a: string, b: string) => { attester.set(a, b); attester.set(b, a); };
  const left = players.filter((p) => p.side === "left"), right = players.filter((p) => p.side === "right");
  if (left.length > 0 && left.length === right.length && left.length + right.length === players.length) {
    left.forEach((p, i) => pair(p.profileId, right[i].profileId));
  } else {
    // Uneven sides: alternate sides first so attesters are opponents where possible, then anyone without a side.
    const sided: GroupPlayerInput[] = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) { if (left[i]) sided.push(left[i]); if (right[i]) sided.push(right[i]); }
    const order = [...sided, ...players.filter((p) => !p.side)].map((p) => p.profileId);
    if (order.length === 2) pair(order[0], order[1]);
    else if (order.length === 4) { pair(order[0], order[1]); pair(order[2], order[3]); }
    else if (order.length > 1) order.forEach((id, i) => attester.set(id, order[(i - 1 + order.length) % order.length]));
  }
  return ids.map((profileId) => ({ profileId, attesterProfileId: attester.get(profileId) ?? null }));
}

/** Trips have no groups yet (add-on decision 13): the trip's players in order, in fours; a lone leftover joins the group before it. */
export function groupTripPlayers(profileIds: string[], size = 4): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < profileIds.length; i += size) groups.push(profileIds.slice(i, i + size));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(...(groups.pop() as string[]));
  return groups;
}

/** The organizer (or whoever started a personal round) changes who attests a player, until cards are submitted. */
export function swapAttester(players: RoundGroupPlayer[], profileId: string, attesterProfileId: string): RoundGroupPlayer[] {
  const inGroup = (id: string) => players.some((p) => p.profileId === id);
  if (!inGroup(profileId) || !inGroup(attesterProfileId)) throw new Error("That player isn't in this group.");
  if (profileId === attesterProfileId) throw new Error("A player can't attest themselves.");
  return players.map((p) => p.profileId === profileId ? { ...p, attesterProfileId } : p);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/platform/roundGroups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/platform/roundGroups.ts lib/platform/roundGroups.test.ts
git commit -m "Player & Attest: groups and automatic attester pairings"
```

---

### Task 3: Live cards (the in-progress card) and matching

**Files:**
- Create: `lib/platform/liveCards.ts`
- Test: `lib/platform/liveCards.test.ts`

**Interfaces:**
- Consumes: `HolePenalties`, `ShotResult`, `ScoredCard` (Task 1).
- Produces:
  - `interface LiveCardHole { number: number; strokes: number | null; putts: number | null; fairway: ShotResult | null; green: ShotResult | null; penalties: HolePenalties; attestStrokes: number | null }`
  - `interface LiveCard { groupId: string; profileId: string; holes: LiveCardHole[] }`
  - `interface SheetCard { strokes: (number | null)[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; penalties: HolePenalties[]; attestStrokes: (number | null)[] }`
  - `liveCardFromSheet(groupId: string, profileId: string, sheet: SheetCard): LiveCard`
  - `mismatchedHoles(card: LiveCard): number[]`
  - `cardComplete(card: LiveCard, par: number[]): boolean`
  - `readyToSubmit(card: LiveCard, par: number[], attested: boolean): boolean`
  - `scoredCardFrom(card: LiveCard, strokes?: number[]): ScoredCard`

- [ ] **Step 1: Write the failing test**

```ts
// lib/platform/liveCards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardComplete, liveCardFromSheet, mismatchedHoles, readyToSubmit, scoredCardFrom, type SheetCard } from "./liveCards.ts";

const par = Array.from({ length: 18 }, (_, i) => (i === 2 ? 3 : 4));
const sheet = (overrides: Partial<SheetCard> = {}): SheetCard => ({
  strokes: par.map((p) => p), putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "left"),
  penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p) => p), ...overrides,
});

test("a full card where the attester agrees on every hole is ready", () => {
  const card = liveCardFromSheet("g1", "me", sheet());
  assert.deepEqual(mismatchedHoles(card), []);
  assert.equal(cardComplete(card, par), true);
  assert.equal(readyToSubmit(card, par, true), true);
});

test("one stroke apart on one hole blocks Submit and names the hole", () => {
  const attestStrokes = par.map((p, i) => (i === 6 ? p + 1 : p));
  const card = liveCardFromSheet("g1", "me", sheet({ attestStrokes }));
  assert.deepEqual(mismatchedHoles(card), [7]);
  assert.equal(readyToSubmit(card, par, true), false);
});

test("a hole the attester hasn't entered yet counts as not matching", () => {
  const card = liveCardFromSheet("g1", "me", sheet({ attestStrokes: par.map((p, i) => (i === 0 ? null : p)) }));
  assert.deepEqual(mismatchedHoles(card), [1]);
});

test("par 3s need no fairway; any other missing stat means not complete", () => {
  assert.equal(cardComplete(liveCardFromSheet("g1", "me", sheet()), par), true);
  assert.equal(cardComplete(liveCardFromSheet("g1", "me", sheet({ putts: par.map((_, i) => (i === 5 ? null : 2)) })), par), false);
  assert.equal(cardComplete(liveCardFromSheet("g1", "me", sheet({ fairways: par.map(() => null) })), par), false);
});

test("a solo card (no attester) only needs to be complete", () => {
  const card = liveCardFromSheet("g1", "me", sheet({ attestStrokes: par.map(() => null) }));
  assert.equal(readyToSubmit(card, par, false), true);
});

test("scoredCardFrom keeps stats and penalties, and can take chosen strokes", () => {
  const card = liveCardFromSheet("g1", "me", sheet({ penalties: par.map((_, i) => ({ fairway: false, green: i === 4 })) }));
  const scored = scoredCardFrom(card, par.map(() => 5));
  assert.equal(scored.strokes[0], 5);
  assert.equal(scored.penalties?.[4].green, true);
  assert.throws(() => scoredCardFrom(liveCardFromSheet("g1", "me", sheet({ strokes: par.map((p, i) => (i === 0 ? null : p)) }))), /Hole 1 has no score/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/platform/liveCards.test.ts`
Expected: FAIL with "Cannot find module './liveCards.ts'".

- [ ] **Step 3: Implement**

```ts
// lib/platform/liveCards.ts
import type { HolePenalties, ScoredCard, ShotResult } from "./playerRounds";

/**
 * A player's card while the round is being played (Player & Attest add-on). The player writes their own strokes and
 * stats; their attester's phone writes `attestStrokes`. On Submit & Save it becomes the player's `PlayerRound`.
 */
export interface LiveCardHole { number: number; strokes: number | null; putts: number | null; fairway: ShotResult | null; green: ShotResult | null; penalties: HolePenalties; attestStrokes: number | null }
export interface LiveCard { groupId: string; profileId: string; holes: LiveCardHole[] }
/** The Scoring sheet's arrays, one entry per hole. */
export interface SheetCard { strokes: (number | null)[]; putts: (number | null)[]; fairways: (ShotResult | null)[]; greens: (ShotResult | null)[]; penalties: HolePenalties[]; attestStrokes: (number | null)[] }

export function liveCardFromSheet(groupId: string, profileId: string, sheet: SheetCard): LiveCard {
  return { groupId, profileId, holes: sheet.strokes.map((strokes, i) => ({
    number: i + 1, strokes, putts: sheet.putts[i] ?? null, fairway: sheet.fairways[i] ?? null, green: sheet.greens[i] ?? null,
    penalties: sheet.penalties[i] ?? { fairway: false, green: false }, attestStrokes: sheet.attestStrokes[i] ?? null,
  })) };
}

/** Holes where the player and the attester don't agree yet, including a hole only one of them has entered. */
export const mismatchedHoles = (card: LiveCard) => card.holes.filter((h) => h.strokes !== h.attestStrokes).map((h) => h.number);

/** Every hole has strokes, putts and a green; a fairway too, except on par 3s. */
export const cardComplete = (card: LiveCard, par: number[]) => card.holes.every((h) =>
  h.strokes !== null && h.putts !== null && h.green !== null && (par[h.number - 1] === 3 || h.fairway !== null));

/** Submit & Save lights up: complete, and (unless solo) the attester agrees on every hole. */
export const readyToSubmit = (card: LiveCard, par: number[], attested: boolean) => cardComplete(card, par) && (!attested || mismatchedHoles(card).length === 0);

/** The saved card: the player's own strokes, or `strokes` chosen by the organizer (push-through). */
export function scoredCardFrom(card: LiveCard, strokes?: number[]): ScoredCard {
  return {
    strokes: card.holes.map((h, i) => {
      const value = strokes?.[i] ?? h.strokes;
      if (value === null) throw new Error(`Hole ${h.number} has no score.`);
      return value;
    }),
    putts: card.holes.map((h) => h.putts), fairways: card.holes.map((h) => h.fairway), greens: card.holes.map((h) => h.green),
    penalties: card.holes.map((h) => h.penalties),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/platform/liveCards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/platform/liveCards.ts lib/platform/liveCards.test.ts
git commit -m "Player & Attest: live cards and attester matching"
```

---

### Task 4: Organizer override, push-through and the change log

**Files:**
- Create: `lib/platform/scoreEdits.ts`
- Test: `lib/platform/scoreEdits.test.ts`

**Interfaces:**
- Consumes: `buildPlayerRound`, `PlayerRound`, `ScoreEdit`, `EditableField`, `ShotResult` (Task 1); `LiveCard`, `mismatchedHoles` (Task 3).
- Produces:
  - `interface OverrideInput { hole: number; field: EditableField; to: number | ShotResult | null; byProfileId: string; at: string; reason: string }`
  - `overrideHole(round: PlayerRound, input: OverrideInput): PlayerRound`
  - `type PushChoice = "player" | "attester"`
  - `pushThrough(card: LiveCard, choices: Record<number, PushChoice>, byProfileId: string, at: string, reason: string): { strokes: number[]; edits: ScoreEdit[] }`
  - `organizerOwnEdits(rounds: PlayerRound[]): { round: PlayerRound; edit: ScoreEdit }[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/platform/scoreEdits.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, type PlayerRound } from "./playerRounds.ts";
import { liveCardFromSheet } from "./liveCards.ts";
import { organizerOwnEdits, overrideHole, pushThrough } from "./scoreEdits.ts";

const par = Array.from({ length: 18 }, (_, i) => (i === 2 ? 3 : 4));
const tripRound = (extra: Partial<PlayerRound> = {}): PlayerRound => buildPlayerRound({
  id: "r1", profileId: "jake", source: "trip", tripId: "t", tripRoundId: "round-1", datePlayed: "2027-04-12",
  course: { ref: null, name: "Pine", place: "" }, tee: { name: "Blue", rating: 71.4, slope: 131 }, holesPlayed: 18, format: "Stroke play", enteredBy: "player",
  holes: par.map((p, i) => ({ number: i + 1, par: p, strokes: p, putts: 2, fairway: p === 3 ? null : "center", green: "center" })), ...extra,
});
const edit = { byProfileId: "cade", at: "2027-04-12T20:00:00Z", reason: "OB on 7" };

test("an override changes the hole, logs old → new with the reason, re-totals and still counts", () => {
  const before = tripRound({ removedFromProfile: true, groupId: "g1" });
  const after = overrideHole(before, { hole: 7, field: "strokes", to: 6, ...edit });
  assert.equal(after.holes[6].strokes, 6);
  assert.equal(after.total, before.total + 2);
  assert.equal(after.countsForHandicap, true);
  assert.notEqual(after.differential, before.differential);
  assert.equal(after.removedFromProfile, true);
  assert.equal(after.groupId, "g1");
  assert.deepEqual(after.edits, [{ hole: 7, field: "strokes", from: 4, to: 6, kind: "override", ...edit }]);
});

test("stats can be overridden too, and the log keeps every change in order", () => {
  const once = overrideHole(tripRound(), { hole: 1, field: "putts", to: 3, ...edit });
  const twice = overrideHole(once, { hole: 1, field: "green", to: "left", ...edit, reason: "Missed left" });
  assert.deepEqual(twice.edits?.map((e) => e.field), ["putts", "green"]);
  assert.equal(twice.holes[0].green, "left");
});

test("an override is refused without a reason, for a personal round, for a fairway on a par 3, or for a bad value", () => {
  assert.throws(() => overrideHole(tripRound(), { hole: 7, field: "strokes", to: 6, ...edit, reason: "  " }), /reason/);
  assert.throws(() => overrideHole(tripRound({ source: "personal" }), { hole: 7, field: "strokes", to: 6, ...edit }), /no organizer/);
  assert.throws(() => overrideHole(tripRound(), { hole: 3, field: "fairway", to: "left", ...edit }), /par 3/);
  assert.throws(() => overrideHole(tripRound(), { hole: 7, field: "strokes", to: 0, ...edit }), /1–20/);
  assert.throws(() => overrideHole(tripRound(), { hole: 7, field: "strokes", to: 4, ...edit }), /already/);
  assert.throws(() => overrideHole(tripRound(), { hole: 19, field: "strokes", to: 4, ...edit }), /isn't on this card/);
});

const stuck = () => liveCardFromSheet("g1", "jake", {
  strokes: par.map((p, i) => (i === 4 ? 5 : p)), putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "center"),
  penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p, i) => (i === 4 ? 6 : p)),
});

test("push-through uses the organizer's pick on each mismatched hole and logs it", () => {
  const result = pushThrough(stuck(), { 5: "attester" }, "cade", edit.at, "Group agreed it was 6");
  assert.equal(result.strokes[4], 6);
  assert.equal(result.strokes[0], 4);
  assert.deepEqual(result.edits, [{ hole: 5, field: "strokes", from: 5, to: 6, byProfileId: "cade", at: edit.at, reason: "Group agreed it was 6", kind: "pushThrough" }]);
});

test("push-through is refused when a mismatched hole has no pick, the reason is blank, or nothing is mismatched", () => {
  assert.throws(() => pushThrough(stuck(), {}, "cade", edit.at, "x"), /Pick a score for hole 5/);
  assert.throws(() => pushThrough(stuck(), { 5: "player" }, "cade", edit.at, " "), /reason/);
  const matching = liveCardFromSheet("g1", "jake", { strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => "center"),
    penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par });
  assert.throws(() => pushThrough(matching, {}, "cade", edit.at, "x"), /already match/);
});

test("the trip-visible log lists only changes an organizer made to their own round", () => {
  const own = overrideHole(tripRound({ id: "mine", profileId: "cade" }), { hole: 7, field: "strokes", to: 5, ...edit });
  const other = overrideHole(tripRound(), { hole: 7, field: "strokes", to: 5, ...edit });
  assert.deepEqual(organizerOwnEdits([own, other]).map((x) => x.round.id), ["mine"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/platform/scoreEdits.test.ts`
Expected: FAIL with "Cannot find module './scoreEdits.ts'".

- [ ] **Step 3: Implement**

```ts
// lib/platform/scoreEdits.ts
import { buildPlayerRound, type EditableField, type PlayerRound, type ScoreEdit, type ShotResult } from "./playerRounds";
import { mismatchedHoles, type LiveCard } from "./liveCards";

/**
 * Organizer fixes (Player & Attest add-on, decisions 9–10). Players can never change a submitted round; the trip or
 * tournament organizer can, with a reason, and every change is kept in the round's `edits` log. Fixed rounds still
 * count toward handicap (decision 14), so `enteredBy` stays "player" and the differential is recomputed.
 */
const SHOTS: ShotResult[] = ["up", "left", "center", "right", "down"];
export interface OverrideInput { hole: number; field: EditableField; to: number | ShotResult | null; byProfileId: string; at: string; reason: string }

export function overrideHole(round: PlayerRound, input: OverrideInput): PlayerRound {
  if (round.source === "personal") throw new Error("Personal rounds have no organizer.");
  const reason = input.reason.trim();
  if (!reason) throw new Error("Add a reason for the change.");
  const hole = round.holes.find((h) => h.number === input.hole);
  if (!hole) throw new Error(`Hole ${input.hole} isn't on this card.`);
  const { field, to } = input;
  if (field === "strokes" && !(typeof to === "number" && Number.isInteger(to) && to >= 1 && to <= 20)) throw new Error("Strokes must be 1–20.");
  if (field === "putts" && to !== null && !(typeof to === "number" && Number.isInteger(to) && to >= 0 && to <= 10)) throw new Error("Putts must be 0–10.");
  if ((field === "fairway" || field === "green") && to !== null && !SHOTS.includes(to as ShotResult)) throw new Error("Pick where the shot finished.");
  if (field === "fairway" && hole.par === 3) throw new Error("There's no fairway on a par 3.");
  const from = hole[field];
  if (from === to) throw new Error("That's already the value.");
  const edit: ScoreEdit = { hole: input.hole, field, from, to, byProfileId: input.byProfileId, at: input.at, reason, kind: "override" };
  return buildPlayerRound({ ...round, holes: round.holes.map((h) => h.number === input.hole ? { ...h, [field]: to } : h), edits: [...(round.edits ?? []), edit] });
}

export type PushChoice = "player" | "attester";

/** A card that can't be submitted (scores don't match): the organizer picks whose strokes count on each mismatched hole. */
export function pushThrough(card: LiveCard, choices: Record<number, PushChoice>, byProfileId: string, at: string, reason: string): { strokes: number[]; edits: ScoreEdit[] } {
  const why = reason.trim();
  if (!why) throw new Error("Add a reason for the push-through.");
  const mismatched = mismatchedHoles(card);
  if (!mismatched.length) throw new Error("Nothing to push through: the scores already match.");
  const missing = mismatched.filter((n) => !choices[n]);
  if (missing.length) throw new Error(`Pick a score for hole ${missing.join(", ")}.`);
  const edits: ScoreEdit[] = [];
  const strokes = card.holes.map((h) => {
    if (!mismatched.includes(h.number)) {
      if (h.strokes === null) throw new Error(`Hole ${h.number} has no score.`);
      return h.strokes;
    }
    const pick = choices[h.number] === "player" ? h.strokes : h.attestStrokes;
    if (pick === null) throw new Error(`Hole ${h.number}: that score wasn't entered.`);
    edits.push({ hole: h.number, field: "strokes", from: h.strokes, to: pick, byProfileId, at, reason: why, kind: "pushThrough" });
    return pick;
  });
  return { strokes, edits };
}

/** Decision 9: changes an organizer made to their own round, which everyone on the trip can see. */
export const organizerOwnEdits = (rounds: PlayerRound[]) =>
  rounds.flatMap((round) => (round.edits ?? []).filter((edit) => edit.byProfileId === round.profileId).map((edit) => ({ round, edit })));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/platform/scoreEdits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/platform/scoreEdits.ts lib/platform/scoreEdits.test.ts
git commit -m "Player & Attest: organizer override, push-through and change log"
```

---

### Task 5: Who sees which rounds on a profile, trip stats, trip round state

**Files:**
- Create: `lib/platform/roundVisibility.ts`, `lib/platform/tripStats.ts`, `lib/platform/tripRoundState.ts`
- Test: `lib/platform/roundVisibility.test.ts`, `lib/platform/tripStats.test.ts`, `lib/platform/tripRoundState.test.ts`

**Interfaces:**
- Consumes: `PlayerRound` (Task 1), `RoundsVisibility`.
- Produces:
  - `defaultRoundVisibility(profile: RoundsVisibility): RoundsVisibility`
  - `profileRounds(rounds: PlayerRound[], who: { viewerId: string; ownerId: string; profileVisibility: RoundsVisibility }): PlayerRound[]`
  - `interface TripStatsRow { profileId: string; rounds: number; scoringAvg: number; puttsAvg: number | null; fairwayPct: number | null; greenPct: number | null }`
  - `type TripStatsTotals = Omit<TripStatsRow, "profileId">`
  - `tripStats(rounds: PlayerRound[], tripId: string): { players: TripStatsRow[]; trip: TripStatsTotals | null }`
  - `interface TripRoundState { state: "open" | "closed"; openedAt?: string; closedAt?: string }`
  - `tripRoundOpen(entry: TripRoundState | undefined, scheduledToday: boolean): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/platform/roundVisibility.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, type PlayerRound } from "./playerRounds.ts";
import { defaultRoundVisibility, profileRounds } from "./roundVisibility.ts";

const r = (id: string, extra: Partial<PlayerRound>): PlayerRound => buildPlayerRound({
  id, profileId: "owner", source: "trip", datePlayed: "2027-04-12", course: { ref: null, name: "Pine", place: "" }, tee: null,
  holesPlayed: 18, format: "Stroke play", enteredBy: "player", holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokes: 4, putts: 2, fairway: null, green: null })), ...extra,
});
const rounds = [r("trip", {}), r("pubPersonal", { source: "personal", visibility: "public" }), r("privPersonal", { source: "personal", visibility: "private" }), r("removed", { removedFromProfile: true })];
const seen = (viewerId: string, profileVisibility: "public" | "private") => profileRounds(rounds, { viewerId, ownerId: "owner", profileVisibility }).map((x) => x.id);

test("you see all your own rounds except ones you removed", () => assert.deepEqual(seen("owner", "private"), ["trip", "pubPersonal", "privPersonal"]));
test("others see a personal round only with a Public profile AND a Public round", () => assert.deepEqual(seen("other", "public"), ["trip", "pubPersonal"]));
test("a Private profile shows others nothing", () => assert.deepEqual(seen("other", "private"), []));
test("a new personal round starts matching the profile", () => assert.equal(defaultRoundVisibility("public"), "public"));
```

```ts
// lib/platform/tripStats.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerRound, type PlayerRound } from "./playerRounds.ts";
import { tripStats } from "./tripStats.ts";

const par = Array.from({ length: 18 }, (_, i) => (i < 4 ? 3 : 4)); // 4 par 3s → 14 fairway holes
const round = (id: string, profileId: string, strokes: number, extra: Partial<PlayerRound> = {}): PlayerRound => buildPlayerRound({
  id, profileId, source: "trip", tripId: "t1", tripRoundId: "round-1", datePlayed: "2027-04-12", course: { ref: null, name: "Pine", place: "" }, tee: null,
  holesPlayed: 18, format: "Stroke play", enteredBy: "player",
  holes: par.map((p, i) => ({ number: i + 1, par: p, strokes, putts: 2, fairway: p === 3 ? null : i % 2 ? "center" : "left", green: i < 9 ? "center" : "right" })), ...extra,
});

test("per-player averages and percentages, best scoring average first, plus a trip row", () => {
  const stats = tripStats([round("a", "jake", 5), round("b", "cade", 4), round("c", "cade", 5)], "t1");
  assert.deepEqual(stats.players.map((p) => [p.profileId, p.rounds, p.scoringAvg]), [["cade", 2, 81], ["jake", 1, 90]]);
  assert.equal(stats.players[0].puttsAvg, 36);
  assert.equal(stats.players[0].fairwayPct, 50);  // 7 of 14
  assert.equal(stats.players[0].greenPct, 50);    // 9 of 18
  assert.deepEqual(stats.trip, { rounds: 3, scoringAvg: 84, puttsAvg: 36, fairwayPct: 50, greenPct: 50 });
});

test("only this trip's rounds; a round removed from a profile still counts for the trip", () => {
  const stats = tripStats([round("a", "jake", 4, { removedFromProfile: true }), round("x", "jake", 4, { tripId: "other" }), round("p", "jake", 4, { source: "personal", tripId: undefined })], "t1");
  assert.equal(stats.players[0].rounds, 1);
});

test("no rounds yet → no rows and no trip row", () => assert.deepEqual(tripStats([], "t1"), { players: [], trip: null }));

test("missing stats show as null, not 0", () => {
  const blank = buildPlayerRound({ ...round("a", "jake", 4), holes: par.map((p, i) => ({ number: i + 1, par: p, strokes: 4, putts: null, fairway: null, green: null })) });
  const row = tripStats([blank], "t1").players[0];
  assert.deepEqual([row.puttsAvg, row.fairwayPct, row.greenPct], [null, null, null]);
});
```

```ts
// lib/platform/tripRoundState.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tripRoundOpen } from "./tripRoundState.ts";

test("a round opens on its scheduled day by itself", () => assert.equal(tripRoundOpen(undefined, true), true));
test("not scheduled today and never started → closed", () => assert.equal(tripRoundOpen(undefined, false), false));
test("Start round opens it early; End round closes it even on the day", () => {
  assert.equal(tripRoundOpen({ state: "open", openedAt: "x" }, false), true);
  assert.equal(tripRoundOpen({ state: "closed", closedAt: "x" }, true), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test lib/platform/roundVisibility.test.ts lib/platform/tripStats.test.ts lib/platform/tripRoundState.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```ts
// lib/platform/roundVisibility.ts
import type { PlayerRound } from "./playerRounds";
import type { RoundsVisibility } from "./playerRoundsPrivacy";

/** A new personal ("just playing") round starts matching the player's Privacy setting (add-on decision 11). */
export const defaultRoundVisibility = (profile: RoundsVisibility): RoundsVisibility => profile;

/**
 * Profile → Rounds: the owner's rounds this viewer may see. Removed rounds never show (decision 15). The owner sees the
 * rest. Others need a Public profile; a personal round also has to be Public itself (no setting = the profile's).
 */
export function profileRounds(rounds: PlayerRound[], { viewerId, ownerId, profileVisibility }: { viewerId: string; ownerId: string; profileVisibility: RoundsVisibility }): PlayerRound[] {
  return rounds.filter((round) => round.profileId === ownerId && !round.removedFromProfile && (viewerId === ownerId
    || (profileVisibility === "public" && (round.source !== "personal" || (round.visibility ?? profileVisibility) === "public"))));
}
```

```ts
// lib/platform/tripStats.ts
import type { PlayerRound } from "./playerRounds";

/** Trip stats (add-on "What shows where"): per-player totals across the trip's saved rounds, plus a trip-wide row. */
export interface TripStatsRow { profileId: string; rounds: number; scoringAvg: number; puttsAvg: number | null; fairwayPct: number | null; greenPct: number | null }
export type TripStatsTotals = Omit<TripStatsRow, "profileId">;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

function summarize(rounds: PlayerRound[]): TripStatsTotals {
  const holes = rounds.flatMap((round) => round.holes);
  const puttRounds = rounds.filter((round) => round.holes.length > 0 && round.holes.every((h) => h.putts !== null));
  const fairways = holes.filter((h) => h.par !== 3 && h.fairway !== null), greens = holes.filter((h) => h.green !== null);
  const pct = (hit: number, of: number) => of ? Math.round((hit / of) * 100) : null;
  return {
    rounds: rounds.length,
    scoringAvg: oneDecimal(rounds.reduce((sum, round) => sum + round.total, 0) / rounds.length),
    puttsAvg: puttRounds.length ? oneDecimal(puttRounds.reduce((sum, round) => sum + round.holes.reduce((s, h) => s + (h.putts ?? 0), 0), 0) / puttRounds.length) : null,
    fairwayPct: pct(fairways.filter((h) => h.fairway === "center").length, fairways.length),
    greenPct: pct(greens.filter((h) => h.green === "center").length, greens.length),
  };
}

/** Rounds removed from a player's profile still count here: the trip keeps them (decision 15). */
export function tripStats(rounds: PlayerRound[], tripId: string): { players: TripStatsRow[]; trip: TripStatsTotals | null } {
  const tripRounds = rounds.filter((round) => round.source === "trip" && round.tripId === tripId);
  if (!tripRounds.length) return { players: [], trip: null };
  const byPlayer = new Map<string, PlayerRound[]>();
  for (const round of tripRounds) byPlayer.set(round.profileId, [...(byPlayer.get(round.profileId) ?? []), round]);
  const players = [...byPlayer].map(([profileId, list]) => ({ profileId, ...summarize(list) })).sort((a, b) => a.scoringAvg - b.scoringAvg);
  return { players, trip: summarize(tripRounds) };
}
```

```ts
// lib/platform/tripRoundState.ts
/**
 * Live rounds (add-on decision 12): a trip round opens by itself on its scheduled day; the organizer can Start it early
 * or End it. Once the organizer has done either, that wins.
 */
export interface TripRoundState { state: "open" | "closed"; openedAt?: string; closedAt?: string }
export const tripRoundOpen = (entry: TripRoundState | undefined, scheduledToday: boolean) => entry ? entry.state === "open" : scheduledToday;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/platform/roundVisibility.test.ts lib/platform/tripStats.test.ts lib/platform/tripRoundState.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/platform/roundVisibility.ts lib/platform/roundVisibility.test.ts lib/platform/tripStats.ts lib/platform/tripStats.test.ts lib/platform/tripRoundState.ts lib/platform/tripRoundState.test.ts
git commit -m "Player & Attest: profile visibility, trip stats and trip round state"
```

---

### Task 6: Dev trip group + leaderboard from saved rounds

**Files:**
- Create: `lib/dev/devTripScores.ts`
- Test: `lib/dev/devTripScores.test.ts`

**Interfaces:**
- Consumes: `assignAttesters`, `RoundGroup` (Task 2); `PlayerRound`; `GolfMatchPreview`, `normalizeCompetitor` (`lib/platform/golfTripPreviewFixture.ts`); `DEV_TRIP_ID`, `devTripRoundId` (`lib/dev/devPlayerRounds.ts`).
- Produces:
  - `interface DevGroup extends RoundGroup { names: Record<string, string> }` — `names` maps profile id → leaderboard golfer name.
  - `devGolferId(name: string): string`
  - `devTripGroup(match: GolfMatchPreview, viewAs: string, swaps?: Record<string, string>): DevGroup | null` — swaps keyed `` `${groupId}|${profileId}` `` → attester id.
  - `attesteeOf(group: RoundGroup, profileId: string): string | null` — whose score this player keeps.
  - `withSavedRounds(match: GolfMatchPreview, group: DevGroup, rounds: PlayerRound[]): GolfMatchPreview`

- [ ] **Step 1: Write the failing test**

```ts
// lib/dev/devTripScores.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLF_MATCH_PREVIEW_FOURBALL, GOLF_MATCH_PREVIEW_SINGLES } from "@/lib/platform/golfTripPreviewFixture";
import { normalizeCompetitor } from "@/lib/platform/golfTripPreviewFixture";
import { buildPlayerRound } from "@/lib/platform/playerRounds";
import { attesteeOf, devGolferId, devTripGroup, withSavedRounds } from "./devTripScores";

test("singles: me and my opponent attest each other", () => {
  const group = devTripGroup(GOLF_MATCH_PREVIEW_SINGLES, "dev-cade")!;
  const opponent = normalizeCompetitor(GOLF_MATCH_PREVIEW_SINGLES.matches[0].right!).golfers[0].name;
  assert.equal(attesteeOf(group, "dev-cade"), devGolferId(opponent));
  assert.equal(group.names[devGolferId(opponent)], opponent);
});

test("fourball: I attest the first golfer on the other side, never my partner", () => {
  const group = devTripGroup(GOLF_MATCH_PREVIEW_FOURBALL, "dev-cade")!;
  const right = normalizeCompetitor(GOLF_MATCH_PREVIEW_FOURBALL.matches[0].right!).golfers;
  assert.equal(group.players.length, 4);
  assert.equal(attesteeOf(group, "dev-cade"), devGolferId(right[0].name));
});

test("a stored swap changes who attests me", () => {
  const plain = devTripGroup(GOLF_MATCH_PREVIEW_FOURBALL, "dev-cade")!;
  const partner = plain.players[1].profileId;
  const swapped = devTripGroup(GOLF_MATCH_PREVIEW_FOURBALL, "dev-cade", { [`${plain.id}|dev-cade`]: partner })!;
  assert.equal(swapped.players.find((p) => p.profileId === "dev-cade")?.attesterProfileId, partner);
});

test("no matches → no group", () => assert.equal(devTripGroup({ ...GOLF_MATCH_PREVIEW_SINGLES, matches: [] }, "dev-cade"), null));

test("a saved round replaces my leaderboard row: holes, F, and the round's score to par", () => {
  const match = GOLF_MATCH_PREVIEW_SINGLES;
  const group = devTripGroup(match, "dev-cade")!;
  const me = group.names["dev-cade"];
  const round = buildPlayerRound({ id: "r", profileId: "dev-cade", source: "trip", tripId: "dev-trip", tripRoundId: `round-${match.round}`, datePlayed: match.roundDate,
    course: { ref: null, name: match.course, place: "" }, tee: null, holesPlayed: 18, format: match.format, enteredBy: "player",
    holes: match.par.map((p, i) => ({ number: i + 1, par: p, strokes: p + (i === 0 ? 1 : 0), putts: 2, fairway: null, green: null })) });
  const row = withSavedRounds(match, group, [round]).leaderboard.find((r) => r.golfer.name === me)!;
  assert.equal(row.thru, "F");
  assert.equal(row.today, "+1");
  assert.equal(row.holes[0], match.par[0] + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/dev/devTripScores.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/dev/devTripScores.ts
import { normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import type { PlayerRound } from "@/lib/platform/playerRounds";
import { assignAttesters, type RoundGroup } from "@/lib/platform/roundGroups";
import { DEV_TRIP_ID, devTripRoundId } from "./devPlayerRounds";

/**
 * DEV ONLY: the preview trip's group for Player & Attest. The first match's golfers are the group; the signed-in mock
 * account plays as its first golfer (the Scoring sheet's "you"), everyone else gets a stand-in id. `names` maps ids back
 * to leaderboard names.
 */
export interface DevGroup extends RoundGroup { names: Record<string, string> }
export const devGolferId = (name: string) => `dev-golfer:${name}`;

export function devTripGroup(match: GolfMatchPreview, viewAs: string, swaps: Record<string, string> = {}): DevGroup | null {
  const pairing = match.matches[0];
  if (!pairing) return null;
  const left = normalizeCompetitor(pairing.left).golfers, right = pairing.right ? normalizeCompetitor(pairing.right).golfers : [];
  const golfers = [...left.map((g) => ({ name: g.name, side: "left" as const })), ...right.map((g) => ({ name: g.name, side: "right" as const }))];
  if (!golfers.length) return null;
  const competitive = right.length > 0;
  const idOf = (name: string, index: number) => index === 0 ? viewAs : devGolferId(name);
  const id = `${DEV_TRIP_ID}:${devTripRoundId(match)}:group-1`;
  const players = assignAttesters(golfers.map((g, i) => ({ profileId: idOf(g.name, i), side: competitive ? g.side : undefined })))
    .map((p) => swaps[`${id}|${p.profileId}`] ? { ...p, attesterProfileId: swaps[`${id}|${p.profileId}`] } : p);
  return {
    id, source: "trip", tripId: DEV_TRIP_ID, tripRoundId: devTripRoundId(match), course: { ref: null, name: match.course, place: "" },
    datePlayed: match.roundDate, players, startedBy: viewAs, names: Object.fromEntries(golfers.map((g, i) => [idOf(g.name, i), g.name])),
  };
}

/** Whose score this player keeps (they are that player's attester). */
export const attesteeOf = (group: RoundGroup, profileId: string) => group.players.find((p) => p.attesterProfileId === profileId)?.profileId ?? null;

const label = (value: number) => value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
const parse = (text: string) => text === "E" ? 0 : Number.isFinite(Number(text)) ? Number(text) : 0;

/** Saved rounds win on the leaderboard: that golfer's row shows the saved holes, F, and the round to par. */
export function withSavedRounds(match: GolfMatchPreview, group: DevGroup, rounds: PlayerRound[]): GolfMatchPreview {
  const forRound = rounds.filter((round) => round.tripId === group.tripId && round.tripRoundId === group.tripRoundId);
  if (!forRound.length) return match;
  const leaderboard = match.leaderboard.map((row) => {
    const round = forRound.find((r) => group.names[r.profileId] === row.golfer.name);
    if (!round) return row;
    const today = round.holes.reduce((sum, h) => sum + h.strokes - h.par, 0);
    const total = parse(row.total) - parse(row.today) + today;
    return { ...row, holes: round.holes.map((h) => h.strokes), thru: "F", today: label(today), total: label(total),
      golfer: { ...row.golfer, thru: "F", score: label(total) } };
  });
  return { ...match, leaderboard };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/dev/devTripScores.test.ts`
Expected: PASS. If a fixture's leaderboard names its golfers differently from its matches (the saved-round test then can't find the row), stop and report it rather than changing the fixture. If the fourball fixture's first match has fewer than two golfers per side, change the fourball test's expected `players.length` to the fixture's real count (read `GOLF_MATCH_PREVIEW_FOURBALL.matches[0]`) — do not change the fixture.

- [ ] **Step 5: Commit**

```bash
git add lib/dev/devTripScores.ts lib/dev/devTripScores.test.ts
git commit -m "Player & Attest (dev): preview trip group and leaderboard from saved rounds"
```

---

### Task 7: Dev store — live cards, groups, round state, push-through, override, remove

**Files:**
- Modify: `lib/dev/devPlayerRounds.ts`
- Test: `lib/dev/devPlayerRoundsAddon.test.ts` (new)

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces (in `lib/dev/devPlayerRounds.ts`):
  - `interface DevRoundMeta { tripRoundId: string; course: string; datePlayed: string; format: string; par: number[] }`
  - `interface DevLiveCard extends LiveCard { meta: DevRoundMeta }`
  - `DevRoundsState` gains `liveCards: DevLiveCard[]; groups: DevGroup[]; tripRounds: Record<string, TripRoundState>; allowPushThrough: boolean; attesters: Record<string, string>`
  - New actions: `saveLiveCard { card: DevLiveCard }`, `saveGroup { group: DevGroup }`, `setTripRound { tripRoundId: string; state: "open" | "closed"; at: string }`, `setAllowPushThrough { on: boolean }`, `swapAttester { groupId: string; profileId: string; attesterProfileId: string }`, `overrideHole { roundId: string; input: OverrideInput }`, `pushThrough { groupId: string; profileId: string; choices: Record<number, PushChoice>; byProfileId: string; at: string; reason: string }`, `removeFromProfile { roundId: string; profileId: string }`
  - `devRoundMeta(match: GolfMatchPreview): DevRoundMeta`
  - `devTripRound(match, profileId, card, extra?: Pick<PlayerRound, "groupId" | "edits">)` (extra is new and optional)
  - `devTripRoundFrom(meta: DevRoundMeta, profileId: string, card: ScoredCard, extra?: Pick<PlayerRound, "groupId" | "edits">): PlayerRound`

- [ ] **Step 1: Write the failing test**

```ts
// lib/dev/devPlayerRoundsAddon.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLF_MATCH_PREVIEW_SINGLES as match } from "@/lib/platform/golfTripPreviewFixture";
import { liveCardFromSheet } from "@/lib/platform/liveCards";
import { devRoundMeta, devRoundsReducer, devTripRound, parseDevRounds, seedDevRounds, type DevLiveCard } from "./devPlayerRounds";

const par = match.par;
const live = (attestDiff = false): DevLiveCard => ({ ...liveCardFromSheet("g1", "dev-jake", {
  strokes: par.map((p) => p), putts: par.map(() => 2), fairways: par.map((p) => (p === 3 ? null : "center")), greens: par.map(() => "center"),
  penalties: par.map(() => ({ fairway: false, green: false })), attestStrokes: par.map((p, i) => (attestDiff && i === 4 ? p + 1 : p)),
}), meta: devRoundMeta(match) });
const card = { strokes: par, putts: par.map(() => 2), fairways: par.map(() => null), greens: par.map(() => null) };

test("saving the identical live card twice returns the same state (no render loop)", () => {
  const once = devRoundsReducer(seedDevRounds(), { type: "saveLiveCard", card: live() });
  assert.equal(devRoundsReducer(once, { type: "saveLiveCard", card: live() }), once);
  assert.equal(once.liveCards.length, 1);
});

test("submitting a round clears that player's live card", () => {
  const withLive = devRoundsReducer(seedDevRounds(), { type: "saveLiveCard", card: live() });
  const saved = devRoundsReducer(withLive, { type: "saveRound", round: devTripRound(match, "dev-jake", card, { groupId: "g1" }) });
  assert.equal(saved.liveCards.length, 0);
});

test("push-through needs the organizer setting, saves one round with the log, and never twice", () => {
  const stuck = devRoundsReducer(seedDevRounds(), { type: "saveLiveCard", card: live(true) });
  const action = { type: "pushThrough" as const, groupId: "g1", profileId: "dev-jake", choices: { 5: "attester" as const }, byProfileId: "dev-cade", at: "t", reason: "Agreed" };
  assert.throws(() => devRoundsReducer(stuck, action), /push-through is off/);
  const allowed = devRoundsReducer(stuck, { type: "setAllowPushThrough", on: true });
  const pushed = devRoundsReducer(allowed, action);
  const round = pushed.rounds.find((r) => r.profileId === "dev-jake" && r.source === "trip")!;
  assert.equal(round.holes[4].strokes, par[4] + 1);
  assert.equal(round.edits?.[0].kind, "pushThrough");
  assert.equal(round.groupId, "g1");
  assert.equal(pushed.liveCards.length, 0);
  assert.throws(() => devRoundsReducer(pushed, action), /No card to push through/);
});

test("override goes through the pure rule; removing is owner-only and keeps the round for the trip", () => {
  const saved = devRoundsReducer(seedDevRounds(), { type: "saveRound", round: devTripRound(match, "dev-jake", card) });
  const id = saved.rounds.at(-1)!.id;
  const edited = devRoundsReducer(saved, { type: "overrideHole", roundId: id, input: { hole: 1, field: "strokes", to: par[0] + 2, byProfileId: "dev-cade", at: "t", reason: "OB" } });
  assert.equal(edited.rounds.find((r) => r.id === id)!.edits?.length, 1);
  assert.throws(() => devRoundsReducer(edited, { type: "removeFromProfile", roundId: id, profileId: "dev-cade" }), /Only the player/);
  const removed = devRoundsReducer(edited, { type: "removeFromProfile", roundId: id, profileId: "dev-jake" });
  assert.equal(removed.rounds.find((r) => r.id === id)!.removedFromProfile, true);
});

test("Start / End round and attester swaps are stored", () => {
  const started = devRoundsReducer(seedDevRounds(), { type: "setTripRound", tripRoundId: "round-1", state: "open", at: "t1" });
  assert.deepEqual(started.tripRounds["round-1"], { state: "open", openedAt: "t1" });
  const ended = devRoundsReducer(started, { type: "setTripRound", tripRoundId: "round-1", state: "closed", at: "t2" });
  assert.deepEqual(ended.tripRounds["round-1"], { state: "closed", openedAt: "t1", closedAt: "t2" });
  const swapped = devRoundsReducer(ended, { type: "swapAttester", groupId: "g1", profileId: "a", attesterProfileId: "b" });
  assert.equal(swapped.attesters["g1|a"], "b");
});

test("a tab saved before this add-on keeps its rounds and gets empty new parts", () => {
  const old = { rounds: seedDevRounds().rounds, visibility: {}, linkRequests: [] };
  const parsed = parseDevRounds(JSON.stringify(old));
  assert.equal(parsed.rounds.length, old.rounds.length);
  assert.deepEqual([parsed.liveCards, parsed.groups, parsed.tripRounds, parsed.allowPushThrough, parsed.attesters], [[], [], {}, false, {}]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/dev/devPlayerRoundsAddon.test.ts`
Expected: FAIL (`devRoundMeta` not exported, unknown action types).

- [ ] **Step 3: Implement** (all in `lib/dev/devPlayerRounds.ts`; keep every existing line, add around it)

Imports to add:

```ts
import type { LiveCard } from "@/lib/platform/liveCards";
import { scoredCardFrom } from "@/lib/platform/liveCards";
import { overrideHole, pushThrough, type OverrideInput, type PushChoice } from "@/lib/platform/scoreEdits";
import type { TripRoundState } from "@/lib/platform/tripRoundState";
import type { DevGroup } from "./devTripScores";
```

(Use `import type { DevGroup }` only — `devTripScores.ts` imports values from this file, so a value import here would be circular.)

Types: extend `DevRoundsState` and `DevRoundsAction`:

```ts
/** What a trip round's saved card needs (so Organizer settings can save a pushed-through card without the match). */
export interface DevRoundMeta { tripRoundId: string; course: string; datePlayed: string; format: string; par: number[] }
export interface DevLiveCard extends LiveCard { meta: DevRoundMeta }
export interface DevRoundsState {
  rounds: PlayerRound[]; visibility: Record<string, RoundsVisibility>; linkRequests: HistoryLinkRequest[];
  /** Player & Attest add-on: in-progress cards, the preview's groups, Start / End round, the organizer's push-through setting, attester swaps ("groupId|profileId" → attester). */
  liveCards: DevLiveCard[]; groups: DevGroup[]; tripRounds: Record<string, TripRoundState>; allowPushThrough: boolean; attesters: Record<string, string>;
}
export type DevRoundsAction =
  | …existing four…
  | { type: "saveLiveCard"; card: DevLiveCard }
  | { type: "saveGroup"; group: DevGroup }
  | { type: "setTripRound"; tripRoundId: string; state: "open" | "closed"; at: string }
  | { type: "setAllowPushThrough"; on: boolean }
  | { type: "swapAttester"; groupId: string; profileId: string; attesterProfileId: string }
  | { type: "overrideHole"; roundId: string; input: OverrideInput }
  | { type: "pushThrough"; groupId: string; profileId: string; choices: Record<number, PushChoice>; byProfileId: string; at: string; reason: string }
  | { type: "removeFromProfile"; roundId: string; profileId: string };
```

Replace `devTripRound` with a meta-based builder (same behavior for existing callers):

```ts
export const devRoundMeta = (match: GolfMatchPreview): DevRoundMeta => ({ tripRoundId: devTripRoundId(match), course: match.course, datePlayed: match.roundDate, format: match.format, par: match.par });
export function devTripRoundFrom(meta: DevRoundMeta, profileId: string, card: ScoredCard, extra: Pick<PlayerRound, "groupId" | "edits"> = {}): PlayerRound {
  return buildPlayerRound({
    id: playerRoundId("trip", DEV_TRIP_ID, meta.tripRoundId, profileId), profileId, source: "trip", tripId: DEV_TRIP_ID, tripRoundId: meta.tripRoundId,
    datePlayed: meta.datePlayed, course: { ref: null, name: meta.course, place: "" }, tee: DEV_TRIP_TEE,
    holesPlayed: 18, format: meta.format, holes: holesFromCard(card, meta.par), enteredBy: "player", ...extra,
  });
}
export const devTripRound = (match: GolfMatchPreview, profileId: string, card: ScoredCard, extra: Pick<PlayerRound, "groupId" | "edits"> = {}) =>
  devTripRoundFrom(devRoundMeta(match), profileId, card, extra);
```

`seedDevRounds()` returns `{ …existing…, liveCards: [], groups: [], tripRounds: {}, allowPushThrough: false, attesters: {} }`.

Reducer: change `saveRound` and add the new cases:

```ts
    case "saveRound": {
      if (state.rounds.some((r) => r.id === action.round.id)) return state;
      const liveCards = state.liveCards.filter((c) => !(c.profileId === action.round.profileId && c.groupId === action.round.groupId));
      return { ...state, rounds: [...state.rounds, action.round], liveCards };
    }
    case "saveLiveCard": {
      const same = (c: DevLiveCard) => c.groupId === action.card.groupId && c.profileId === action.card.profileId;
      const existing = state.liveCards.find(same);
      if (existing && JSON.stringify(existing) === JSON.stringify(action.card)) return state; // the sheet reports every render
      return { ...state, liveCards: [...state.liveCards.filter((c) => !same(c)), action.card] };
    }
    case "saveGroup": {
      const existing = state.groups.find((g) => g.id === action.group.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(action.group)) return state;
      return { ...state, groups: [...state.groups.filter((g) => g.id !== action.group.id), action.group] };
    }
    case "setTripRound": {
      const before = state.tripRounds[action.tripRoundId];
      const entry: TripRoundState = action.state === "open" ? { ...before, state: "open", openedAt: action.at } : { ...before, state: "closed", closedAt: action.at };
      return { ...state, tripRounds: { ...state.tripRounds, [action.tripRoundId]: entry } };
    }
    case "setAllowPushThrough": return { ...state, allowPushThrough: action.on };
    case "swapAttester": return { ...state, attesters: { ...state.attesters, [`${action.groupId}|${action.profileId}`]: action.attesterProfileId } };
    case "overrideHole": return { ...state, rounds: state.rounds.map((r) => r.id === action.roundId ? overrideHole(r, action.input) : r) };
    case "pushThrough": {
      if (!state.allowPushThrough) throw new Error("Allow push-through is off in Organizer settings.");
      const card = state.liveCards.find((c) => c.groupId === action.groupId && c.profileId === action.profileId);
      if (!card) throw new Error("No card to push through.");
      const { strokes, edits } = pushThrough(card, action.choices, action.byProfileId, action.at, action.reason);
      const round = devTripRoundFrom(card.meta, card.profileId, scoredCardFrom(card, strokes), { groupId: card.groupId, edits });
      return devRoundsReducer(state, { type: "saveRound", round });
    }
    case "removeFromProfile": {
      const round = state.rounds.find((r) => r.id === action.roundId);
      if (!round) return state;
      if (round.profileId !== action.profileId) throw new Error("Only the player can remove a round from their profile.");
      return { ...state, rounds: state.rounds.map((r) => r.id === action.roundId ? { ...r, removedFromProfile: true } : r) };
    }
```

Note `{ ...before, state: "open", openedAt }` on a first Start gives `{ state: "open", openedAt: "t1" }` (spreading `undefined` is fine), matching the test.

`parseDevRounds`: keep the existing validity check for the old fields; when it passes, fill the new parts instead of reseeding:

```ts
    if (…existing condition…) {
      const v = value as Record<string, unknown>;
      return { ...(value as unknown as DevRoundsState),
        liveCards: Array.isArray(v.liveCards) ? v.liveCards as DevLiveCard[] : [],
        groups: Array.isArray(v.groups) ? v.groups as DevGroup[] : [],
        tripRounds: isObject(v.tripRounds) ? v.tripRounds as Record<string, TripRoundState> : {},
        allowPushThrough: v.allowPushThrough === true,
        attesters: isObject(v.attesters) ? v.attesters as Record<string, string> : {} };
    }
```

Bump nothing in `components/dev/useDevPlayerRounds.ts` — the key stays `maroon-dev-player-rounds-v1` so existing tabs keep their rounds (Review Focus 2).

- [ ] **Step 4: Run tests**

Run: `npx tsx --test lib/dev/devPlayerRoundsAddon.test.ts lib/dev/devPlayerRounds.test.ts lib/dev/devTripScores.test.ts`
Expected: PASS (all). Then `npx tsc --noEmit -p .` — expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/dev/devPlayerRounds.ts lib/dev/devPlayerRoundsAddon.test.ts
git commit -m "Player & Attest (dev): live cards, groups, round state, push-through, override, remove in the dev store"
```

---

### Task 8: Full-screen submit animation + Scoring sheet hooks

**Files:**
- Create: `components/platform/SubmitCelebration.tsx`, `components/platform/SubmitCelebration.module.css`
- Modify: `components/platform/GolfTripScoring.tsx`, `components/platform/GolfTripScoring.module.css`

**Interfaces:**
- Consumes: `ScoreEdit`, `HolePenalties` (Task 1); `SheetCard` (Task 3).
- Produces: `GolfTripScoring` new optional props `attesteeName?: string`, `edits?: ScoreEdit[]`, `onCardChange?: (card: SheetCard) => void`; `onSubmit` cards now include `penalties`. `SubmitCelebration({ total: number; toPar: string; onDone: () => void })`.

- [ ] **Step 1: Create the animation**

```tsx
// components/platform/SubmitCelebration.tsx
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import styles from "./SubmitCelebration.module.css";

/** How long the moment lasts before it calls onDone (the CSS slide-out ends at the same time). */
export const CELEBRATION_MS = 2600;

/**
 * Submit & Save's full-screen moment (Player & Attest add-on, decision 16): a maroon screen rises over everything with the
 * final score big, a check and "Card submitted", then slides away to the locked Card underneath.
 */
export function SubmitCelebration({ total, toPar, onDone }: { total: number; toPar: string; onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => { const timer = window.setTimeout(() => done.current(), CELEBRATION_MS); return () => window.clearTimeout(timer); }, []);
  return createPortal(<div className={styles.screen} role="status" aria-live="assertive">
    <span className={styles.check} aria-hidden><Check size={44} strokeWidth={3} /></span>
    <p className={styles.score}>{total}{toPar && <><span className={styles.dot} aria-hidden> · </span><span className={styles.toPar}>{toPar}</span></>}</p>
    <p className={styles.label}>Card submitted</p>
  </div>, document.body);
}
```

```css
/* components/platform/SubmitCelebration.module.css
   Rises from the bottom (.45s), the check pops and the score and label lift in, then at 2.15s it slides back down (.45s). */
.screen{position:fixed;inset:0;z-index:140;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;background:var(--color-maroon-900,#2f0c0e);color:#fbf8f1;text-align:center;
  animation:screenIn .45s cubic-bezier(.2,.8,.2,1) both,screenOut .45s cubic-bezier(.4,0,1,1) 2.15s forwards}
.check{display:grid;place-items:center;width:84px;height:84px;border-radius:999px;border:2px solid var(--color-gold-500,#c49b54);color:var(--color-gold-500,#c49b54);animation:pop .5s cubic-bezier(.2,1.4,.4,1) .25s both}
.score{margin:0;font:700 64px/1 var(--font-spectral),Georgia,serif;letter-spacing:-.01em;animation:rise .5s cubic-bezier(.2,.8,.2,1) .45s both}
.dot{opacity:.5}
.toPar{color:var(--color-gold-500,#c49b54)}
.label{margin:0;font:700 13px/1 var(--font-spectral),Georgia,serif;letter-spacing:.14em;text-transform:uppercase;opacity:.85;animation:rise .5s cubic-bezier(.2,.8,.2,1) .6s both}
@keyframes screenIn{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes screenOut{to{transform:translateY(100%)}}
@keyframes pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes rise{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
```

- [ ] **Step 2: Wire it into `GolfTripScoring.tsx`**

1. Imports: add `import { SubmitCelebration } from "./SubmitCelebration";`, change the playerRounds import to `import type { ScoreEdit, ScoredCard, ShotResult } from "@/lib/platform/playerRounds";` and add `import type { SheetCard } from "@/lib/platform/liveCards";`.
2. Props: add to the destructure and the type:

```ts
  /** Player & Attest: whose score I keep (the second column); without it a made-up opponent name shows. */
  attesteeName?: string;
  /** A saved round's organizer changes: the Card marks those holes and shows the reason when tapped. */
  edits?: ScoreEdit[];
  /** Every change to an unsubmitted card (the dev preview keeps it as the live card the attester and organizer see). */
  onCardChange?: (card: SheetCard) => void;
```

3. Opponent name: replace `const [opponentName] = useState(() => randomOpponentName());` with

```ts
  const [madeUpName] = useState(() => randomOpponentName());
  const opponentName = attesteeName ?? madeUpName;
```

4. After `const readyToSubmit = …` add the live-card report and the celebration state:

```ts
  // The live card (dev): reported only when something changed, so the store isn't written on every render. My
  // attester's strokes for me come from the other phone (otherCard), or stand in from the simulator's card setting.
  const attestStrokes = otherCard ? otherCard.me : submittedHoles.map((h) => opponentCardMatches ? h : null);
  const liveKey = !submitted && (thru > 0 || putts.some((p) => p !== null)) ? JSON.stringify({ strokes: holes, putts, fairways, greens, penalties, attestStrokes }) : null;
  const reportCard = useRef(onCardChange);
  useEffect(() => { reportCard.current = onCardChange; }, [onCardChange]);
  useEffect(() => { if (liveKey) reportCard.current?.(JSON.parse(liveKey) as SheetCard); }, [liveKey]);
  const [celebration, setCelebration] = useState<{ total: number; toPar: string } | null>(null);
```

   (These hooks sit above the early `return` for full-screen views, like the existing ones.)

5. Submit Score button `onClick`: keep what it does and add penalties + the celebration:

```tsx
onClick={() => { setHoles(submittedHoles); setHolesCompetitor(submittedOpponentHoles); setSubmitted(true); setConfirmOpen(false);
  const total = submittedHoles.reduce<number>((sum, h) => sum + (h ?? 0), 0);
  setCelebration({ total, toPar: par ? formatToPar(total - par.reduce((sum, p) => sum + p, 0)) : "" });
  onSubmit?.({ strokes: submittedHoles.map((h) => h ?? 0), putts, fairways, greens, penalties }); }}
```

6. Render the celebration right after the confirm portal: `{celebration && <SubmitCelebration total={celebration.total} toPar={celebration.toPar} onDone={() => setCelebration(null)} />}`
7. Card marks: pass `edits={edits}` to `<ScorecardSection … />`; in `ScorecardSection` add `edits?: ScoreEdit[]` to its props and:

```tsx
  // Organizer changes (add-on decision 9): a gold mark on the hole; tapping it shows the reason under the card.
  const [shownEdit, setShownEdit] = useState<number | null>(null);
  const editsFor = (hole: number) => (edits ?? []).filter((e) => e.hole === hole);
```

   In `holeRow`, change the hole cell to
   `<th scope="row" className={styles.section}>{i + 1}{editsFor(i + 1).length > 0 && <button type="button" className={styles.editMark} aria-label={`Hole ${i + 1} edited by organizer`} onClick={() => setShownEdit(shownEdit === i + 1 ? null : i + 1)}>✎</button>}</th>`
   and after `</table>` add
   `{shownEdit !== null && editsFor(shownEdit).map((e, k) => <p key={k} className={styles.editNote}>Hole {e.hole} edited by organizer{e.kind === "pushThrough" ? " (push-through)" : ""}: {String(e.from ?? "—")} → {String(e.to ?? "—")}. {e.reason}</p>)}`
8. In `GolfTripScoring.module.css` add at the end:

```css
/* Organizer-edited hole on the Card (Player & Attest): a small gold pencil next to the hole number; its reason shows under the card. */
.editMark{margin-left:2px;padding:0 2px;border:0;background:none;color:var(--color-gold-500,#c49b54);font:700 11px/1 var(--font-barlow),sans-serif;cursor:pointer}
.editNote{margin:8px 0 0;font:600 12px/1.35 var(--font-spectral),Georgia,serif;color:rgba(47,12,14,.8)}
```

- [ ] **Step 3: Check types and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/platform/GolfTripScoring.tsx components/platform/SubmitCelebration.tsx`
Expected: no errors.

- [ ] **Step 4: Check it in the browser**

Simulator → a Golf Trip Active page → Round state **End of round, unsubmitted — scores match** → pull up Scoring → Card → Submit & Save → Submit Score. Expected: the maroon screen rises, check + "total · +N" + "Card submitted", slides away after about 2.6 s, Card is locked "Submitted". With **scores don't match**, Submit & Save stays off.

- [ ] **Step 5: Commit**

```bash
git add components/platform/SubmitCelebration.tsx components/platform/SubmitCelebration.module.css components/platform/GolfTripScoring.tsx components/platform/GolfTripScoring.module.css
git commit -m "Player & Attest: full-screen submit animation, attestee name, live card report, edit marks"
```

---

### Task 9: Trip preview — group, live round, leaderboard, trip stats, organizer's own changes

**Files:**
- Create: `components/platform/GolfTripStats.tsx`, `components/platform/GolfTripStats.module.css`
- Modify: `app/dev/tournament/TournamentDataPreview.tsx`, `components/platform/GolfTripHome.tsx`

**Interfaces:**
- Consumes: Tasks 3–8.
- Produces: `GolfTripHome` new optional props `tripStats?: TripStatsView`, `scoreChanges?: ScoreChangeLine[]`, `attesteeName?: string`, `scoringEdits?: ScoreEdit[]`, `onScoringCardChange?: (card: SheetCard) => void`; exported from `GolfTripStats.tsx`:
  - `type TripStatsView = { players: (TripStatsRow & { name: string })[]; trip: TripStatsTotals | null }`
  - `type ScoreChangeLine = { name: string; edit: ScoreEdit }`
  - `GolfTripStats({ stats, changes }: { stats: TripStatsView; changes?: ScoreChangeLine[] })`

- [ ] **Step 1: Create `GolfTripStats`**

```tsx
// components/platform/GolfTripStats.tsx
import type { ScoreEdit } from "@/lib/platform/playerRounds";
import type { TripStatsRow, TripStatsTotals } from "@/lib/platform/tripStats";
import styles from "./GolfTripStats.module.css";

export type TripStatsView = { players: (TripStatsRow & { name: string })[]; trip: TripStatsTotals | null };
export type ScoreChangeLine = { name: string; edit: ScoreEdit };

const show = (value: number | null, suffix = "") => value === null ? "—" : `${value}${suffix}`;

/**
 * Golf tab → Overview, under the leaderboard: trip stats from the saved rounds (Player & Attest add-on), and the
 * organizer's changes to their own round, which everyone on the trip can see (decision 9).
 */
export function GolfTripStats({ stats, changes = [] }: { stats: TripStatsView; changes?: ScoreChangeLine[] }) {
  if (!stats.trip) return <p className={styles.empty}>Trip stats show once the first card is submitted.</p>;
  const row = (key: string, name: string, s: TripStatsTotals, total = false) => <tr key={key} className={total ? styles.total : undefined}>
    <th scope="row">{name}</th><td>{s.rounds}</td><td>{s.scoringAvg}</td><td>{show(s.puttsAvg)}</td><td>{show(s.fairwayPct, "%")}</td><td>{show(s.greenPct, "%")}</td>
  </tr>;
  return <>
    <div className={styles.scroll}><table className={styles.table}>
      <thead><tr><th scope="col">Player</th><th scope="col">Rds</th><th scope="col">Avg</th><th scope="col">Putts</th><th scope="col">FWY</th><th scope="col">GIR</th></tr></thead>
      <tbody>{stats.players.map((p) => row(p.profileId, p.name, p))}{row("trip", "Trip", stats.trip, true)}</tbody>
    </table></div>
    {changes.length > 0 && <section className={styles.changes} aria-label="Organizer's own score changes">
      <h3>Organizer&rsquo;s own score changes</h3>
      <ul>{changes.map(({ name, edit }, i) => <li key={i}>{name}, hole {edit.hole} {edit.field}: {String(edit.from ?? "—")} → {String(edit.to ?? "—")}. {edit.reason}</li>)}</ul>
    </section>}
  </>;
}
```

```css
/* components/platform/GolfTripStats.module.css — sits inside the trip's dark maroon Card. */
.empty{margin:0;color:rgba(251,248,241,.7);font-size:14px}
.scroll{overflow-x:auto}
.table{width:100%;border-collapse:collapse;font:600 13px/1.2 var(--font-barlow),sans-serif;color:#fbf8f1;white-space:nowrap}
.table th,.table td{padding:8px 6px;text-align:right;border-bottom:1px solid rgba(251,248,241,.12)}
.table th[scope=row],.table thead th:first-child{text-align:left}
.table thead th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:rgba(251,248,241,.6)}
.total th,.total td{color:var(--color-gold-500,#c49b54);border-bottom:0}
.changes{margin-top:14px}
.changes h3{margin:0 0 6px;font:700 11px/1 var(--font-barlow),sans-serif;letter-spacing:.06em;text-transform:uppercase;color:rgba(251,248,241,.6)}
.changes ul{margin:0;padding-left:18px;color:#fbf8f1;font-size:13px;line-height:1.4}
```

- [ ] **Step 2: `GolfTripHome.tsx`**

1. Imports: `import { GolfTripStats, type ScoreChangeLine, type TripStatsView } from "./GolfTripStats";`, `import type { ScoreEdit } from "@/lib/platform/playerRounds";`, `import type { SheetCard } from "@/lib/platform/liveCards";`
2. Add to the props destructure and type: `tripStats?: TripStatsView; scoreChanges?: ScoreChangeLine[]; attesteeName?: string; scoringEdits?: ScoreEdit[]; onScoringCardChange?: (card: SheetCard) => void;` with a doc line in the component comment: "`tripStats` / `scoreChanges` (dev preview): trip stats and the organizer's own changes under the Overview leaderboard. `attesteeName`, `scoringEdits`, `onScoringCardChange` pass Player & Attest data to the Scoring sheet."
3. On the `<GolfTripScoring …>` line add `attesteeName={attesteeName} edits={scoringEdits} onCardChange={onScoringCardChange}`.
4. `<GolfSlides …>` gets `tripStats={tripStats} scoreChanges={scoreChanges}`; add both to `GolfSlides`'s props type (`tripStats?: TripStatsView; scoreChanges?: ScoreChangeLine[]`).
5. In `GolfSlides`, the Overview slide becomes:
   `? previewMatch ? <><GolfTripLeaderboard match={previewMatch} />{tripStats && <Card title="Trip stats"><GolfTripStats stats={tripStats} changes={scoreChanges} /></Card>}</> : …unchanged…`

- [ ] **Step 3: `TournamentDataPreview.tsx`**

Imports to add: `useEffect`, `devTripGroup`, `attesteeOf`, `withSavedRounds` from `@/lib/dev/devTripScores`; `devRoundMeta` from `@/lib/dev/devPlayerRounds`; `liveCardFromSheet, type SheetCard` from `@/lib/platform/liveCards`; `tripStats` from `@/lib/platform/tripStats`; `organizerOwnEdits` from `@/lib/platform/scoreEdits`; `tripRoundOpen` from `@/lib/platform/tripRoundState`; `DEV_ACCOUNTS` from `@/lib/dev/devAccounts`.

After the existing `const submittedCard = useMemo(…)` line (so `match` and `saved` already exist) add:

```tsx
  // Player & Attest (dev): this round's group and attesters; I keep my attestee's score. The group is stored so
  // Organizer settings can show it and swap attesters.
  const group = useMemo(() => match ? devTripGroup(match, viewAs, devRounds.attesters) : null, [match, viewAs, devRounds.attesters]);
  useEffect(() => { if (group) dispatchDevRounds({ type: "saveGroup", group }); }, [group]);
  const attestee = group ? attesteeOf(group, viewAs) : null;
  const nameOf = (id: string) => group?.names[id] ?? DEV_ACCOUNTS.find((a) => a.id === id)?.name ?? id;
  // Live round: Start / End round in Organizer settings wins; otherwise the simulator's round state stands in for "today is
  // the round's day". After End round, a card I haven't submitted can still be finished.
  const roundEntry = match ? devRounds.tripRounds[devTripRoundId(match)] : undefined;
  const myLiveCard = group ? devRounds.liveCards.find((c) => c.groupId === group.id && c.profileId === viewAs) : undefined;
  const roundLive = tripRoundOpen(roundEntry, simulatorRoundLive(config.state.roundStatus, data.previewMatch)) || (roundEntry?.state === "closed" && !saved && Boolean(myLiveCard));
  const tripRounds = devRounds.rounds.filter((r) => r.source === "trip" && r.tripId === DEV_TRIP_ID);
  const stats = tripStats(devRounds.rounds, DEV_TRIP_ID);
  const tripStatsView = { players: stats.players.map((p) => ({ ...p, name: nameOf(p.profileId) })), trip: stats.trip };
  const scoreChanges = organizerOwnEdits(tripRounds).map(({ round, edit }) => ({ name: nameOf(round.profileId), edit }));
  const onScoringCardChange = (sheet: SheetCard) => { if (match && group) dispatchDevRounds({ type: "saveLiveCard", card: { ...liveCardFromSheet(group.id, viewAs, sheet), meta: devRoundMeta(match) } }); };
```

Change `onScoringSubmit` to pass the group: `devTripRound(match, viewAs, card, { groupId: group?.id })`.

On `<GolfTripHome …>`: replace `roundLive={simulatorRoundLive(config.state.roundStatus, data.previewMatch)}` with `roundLive={roundLive}`, and add
`previewMatch={match && group ? withSavedRounds(match, group, tripRounds) : match} tripStats={tripStatsView} scoreChanges={scoreChanges} attesteeName={attestee ? nameOf(attestee) : undefined} scoringEdits={saved?.edits} onScoringCardChange={onScoringCardChange}`
(`previewMatch=` must come **after** `{...data}` so it wins).

- [ ] **Step 4: Types, lint, tests**

Run: `npx tsc --noEmit -p .`, `npx eslint app/dev/tournament/TournamentDataPreview.tsx components/platform/GolfTripHome.tsx components/platform/GolfTripStats.tsx`, `npm test`
Expected: no errors; all tests pass.

- [ ] **Step 5: Browser check**

Simulator → Golf Trip Active → Golf tab → Overview, Round state **End of round — scores match**: Card's second column shows the attestee's last name (not a random name). Submit → after the animation, the leaderboard row shows F and the saved score; **Trip stats** card appears under the leaderboard with a row for you and a gold Trip row. Switch "Signed in as" to another account → their sheet opens unsubmitted.

- [ ] **Step 6: Commit**

```bash
git add components/platform/GolfTripStats.tsx components/platform/GolfTripStats.module.css components/platform/GolfTripHome.tsx app/dev/tournament/TournamentDataPreview.tsx
git commit -m "Player & Attest (dev): group, live round, leaderboard and trip stats from saved rounds"
```

---

### Task 10: Organizer settings → Player Scoring: rounds, attesters, push-through, overrides

**Files:**
- Create: `components/platform/OrganizerScores.tsx`
- Modify: `components/platform/GolfTripSettingsPreview.tsx` (one line inside the existing `{playerScoringOpen && …}` block)

**Interfaces:**
- Consumes: dev store actions (Task 7), `swapAttester`, `mismatchedHoles`, `cardComplete`, `DEV_ACCOUNTS`.
- Produces: `OrganizerScores({ roundNumbers, organizerId }: { roundNumbers: number[]; organizerId: string })`.

- [ ] **Step 1: Create the component**

```tsx
// components/platform/OrganizerScores.tsx
"use client";

import { useState } from "react";
import { dispatchDevRounds, useDevPlayerRounds } from "@/components/dev/useDevPlayerRounds";
import { DEV_ACCOUNTS } from "@/lib/dev/devAccounts";
import { DEV_TRIP_ID, type DevLiveCard } from "@/lib/dev/devPlayerRounds";
import { cardComplete, mismatchedHoles } from "@/lib/platform/liveCards";
import type { EditableField, PlayerRound } from "@/lib/platform/playerRounds";
import { swapAttester } from "@/lib/platform/roundGroups";
import type { PushChoice } from "@/lib/platform/scoreEdits";
import notificationStyles from "./GolfTripNotifications.module.css";
import toggleStyles from "./GolfTripCompetition.module.css";

/**
 * DEV ONLY (Player & Attest add-on): the trip organizer's score tools in Organizer settings → Player Scoring. Start / End
 * each round, change who attests whom, Allow push-through (off by default), push a stuck card through, and override a
 * submitted hole. Every change needs a reason and lands in the round's change log. Reads and writes the shared dev store.
 */
export function OrganizerScores({ roundNumbers, organizerId }: { roundNumbers: number[]; organizerId: string }) {
  const store = useDevPlayerRounds();
  const [error, setError] = useState<string | null>(null);
  const run = (action: Parameters<typeof dispatchDevRounds>[0]) => { try { dispatchDevRounds(action); setError(null); return true; } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; } };
  const nameOf = (id: string) => store.groups.flatMap((g) => Object.entries(g.names)).find(([key]) => key === id)?.[1] ?? DEV_ACCOUNTS.find((a) => a.id === id)?.name ?? id;
  const now = () => new Date().toISOString();
  const submitted = store.rounds.filter((r) => r.source === "trip" && r.tripId === DEV_TRIP_ID);
  const stuck = store.liveCards.filter((c) => cardComplete(c, c.meta.par) && mismatchedHoles(c).length > 0);

  return <>
    {error && <p role="alert" className={notificationStyles.categoryTitle}>{error}</p>}
    <section className={notificationStyles.category} aria-label="Rounds">
      <h2 className={notificationStyles.categoryTitle}>Rounds</h2>
      {roundNumbers.map((n) => {
        const entry = store.tripRounds[`round-${n}`];
        return <div key={n} className={notificationStyles.row}>
          <span className={notificationStyles.label}>Round {n} · {entry ? entry.state === "open" ? "Open" : "Ended" : "Opens on its day"}</span>
          <button type="button" className={toggleStyles.toggle} onClick={() => run({ type: "setTripRound", tripRoundId: `round-${n}`, state: entry?.state === "open" ? "closed" : "open", at: now() })}>
            {entry?.state === "open" ? "End round" : "Start round"}</button>
        </div>;
      })}
    </section>

    <section className={notificationStyles.category} aria-label="Attesters">
      <h2 className={notificationStyles.categoryTitle}>Who attests whom</h2>
      {store.groups.length === 0 && <p className={notificationStyles.label}>Groups show once a round is being scored.</p>}
      {store.groups.flatMap((group) => group.players.map((player) => {
        const locked = submitted.some((r) => r.profileId === player.profileId && r.groupId === group.id);
        return <div key={`${group.id}|${player.profileId}`} className={notificationStyles.row}>
          <span className={notificationStyles.label}>{nameOf(player.profileId)} — attested by</span>
          <select aria-label={`Attester for ${nameOf(player.profileId)}`} value={player.attesterProfileId ?? ""} disabled={locked || group.players.length < 2}
            onChange={(event) => { try { swapAttester(group.players, player.profileId, event.target.value); run({ type: "swapAttester", groupId: group.id, profileId: player.profileId, attesterProfileId: event.target.value }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>
            {group.players.filter((p) => p.profileId !== player.profileId).map((p) => <option key={p.profileId} value={p.profileId}>{nameOf(p.profileId)}</option>)}
          </select>
        </div>;
      }))}
    </section>

    <section className={notificationStyles.category} aria-label="Push-through">
      <h2 className={notificationStyles.categoryTitle}>Cards that can&rsquo;t be submitted</h2>
      <div className={notificationStyles.row}>
        <span className={notificationStyles.label}>Allow push-through</span>
        <button type="button" role="switch" aria-checked={store.allowPushThrough} aria-label="Allow push-through" className={toggleStyles.toggle}
          onClick={() => run({ type: "setAllowPushThrough", on: !store.allowPushThrough })}>
          <span className={toggleStyles.track} data-on={store.allowPushThrough}><span className={toggleStyles.thumb} /></span><span>{store.allowPushThrough ? "On" : "Off"}</span>
        </button>
      </div>
      {stuck.length === 0 ? <p className={notificationStyles.label}>No stuck cards.</p>
        : stuck.map((card) => <PushThroughCard key={`${card.groupId}|${card.profileId}`} card={card} name={nameOf(card.profileId)} allowed={store.allowPushThrough}
          onPush={(choices, reason) => run({ type: "pushThrough", groupId: card.groupId, profileId: card.profileId, choices, byProfileId: organizerId, at: now(), reason })} />)}
    </section>

    <section className={notificationStyles.category} aria-label="Submitted cards">
      <h2 className={notificationStyles.categoryTitle}>Submitted cards</h2>
      {submitted.length === 0 ? <p className={notificationStyles.label}>No submitted cards yet.</p>
        : submitted.map((round) => <OverrideCard key={round.id} round={round} name={nameOf(round.profileId)}
          onSave={(hole, field, to, reason) => run({ type: "overrideHole", roundId: round.id, input: { hole, field, to, byProfileId: organizerId, at: now(), reason } })} />)}
    </section>
  </>;
}

function PushThroughCard({ card, name, allowed, onPush }: { card: DevLiveCard; name: string; allowed: boolean; onPush: (choices: Record<number, PushChoice>, reason: string) => boolean }) {
  const [choices, setChoices] = useState<Record<number, PushChoice>>({});
  const [reason, setReason] = useState("");
  const holes = mismatchedHoles(card);
  return <div className={notificationStyles.row} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
    <span className={notificationStyles.label}>{name} · holes {holes.join(", ")} don&rsquo;t match</span>
    {holes.map((n) => { const h = card.holes[n - 1]; return <div key={n} role="group" aria-label={`Hole ${n}`} style={{ display: "flex", gap: 8 }}>
      <span>Hole {n}</span>
      {(["player", "attester"] as const).map((who) => <button key={who} type="button" aria-pressed={choices[n] === who} onClick={() => setChoices({ ...choices, [n]: who })}>
        {who === "player" ? `Player: ${h.strokes ?? "—"}` : `Attester: ${h.attestStrokes ?? "—"}`}</button>)}
    </div>; })}
    <input aria-label={`Reason for ${name}'s push-through`} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
    <button type="button" disabled={!allowed || holes.some((n) => !choices[n]) || !reason.trim()} onClick={() => { if (onPush(choices, reason)) { setChoices({}); setReason(""); } }}>Push through</button>
  </div>;
}

function OverrideCard({ round, name, onSave }: { round: PlayerRound; name: string; onSave: (hole: number, field: EditableField, to: number | string | null, reason: string) => boolean }) {
  const [hole, setHole] = useState(1);
  const [field, setField] = useState<EditableField>("strokes");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const parsed = field === "strokes" || field === "putts" ? (value === "" ? null : Number(value)) : (value === "" ? null : value);
  return <details className={notificationStyles.row} style={{ display: "block" }}>
    <summary>{name} · {round.total}{round.edits?.length ? ` · ${round.edits.length} change${round.edits.length === 1 ? "" : "s"}` : ""}</summary>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      <select aria-label="Hole" value={hole} onChange={(e) => setHole(Number(e.target.value))}>{round.holes.map((h) => <option key={h.number} value={h.number}>Hole {h.number} (now {h.strokes})</option>)}</select>
      <select aria-label="What to change" value={field} onChange={(e) => { setField(e.target.value as EditableField); setValue(""); }}>
        {(["strokes", "putts", "fairway", "green"] as const).map((f) => <option key={f} value={f}>{f}</option>)}</select>
      {field === "strokes" || field === "putts"
        ? <input aria-label="New value" type="number" min={field === "strokes" ? 1 : 0} max={field === "strokes" ? 20 : 10} value={value} onChange={(e) => setValue(e.target.value)} />
        : <select aria-label="New value" value={value} onChange={(e) => setValue(e.target.value)}><option value="">—</option>{["center", "left", "right", "up", "down"].map((s) => <option key={s} value={s}>{s === "center" ? "hit" : s}</option>)}</select>}
      <input aria-label={`Reason for changing ${name}'s card`} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" disabled={!reason.trim() || (field === "strokes" && parsed === null)} onClick={() => { if (onSave(hole, field, parsed, reason)) { setValue(""); setReason(""); } }}>Save change</button>
    </div>
  </details>;
}
```

`run`'s `dispatchDevRounds` type: `Parameters<typeof dispatchDevRounds>[0]` is `DevRoundsAction`. `onSave`'s `to` is `number | string | null`; cast at the call site with `to as number | ShotResult | null` if TypeScript needs it (import `ShotResult` type) — the reducer's `overrideHole` validates the value either way.

- [ ] **Step 2: Mount it**

In `GolfTripSettingsPreview.tsx`, inside `{playerScoringOpen && <div className={styles.competition}> … </div>}`, after the closing `</section>` of "What players enter", add:
`<OrganizerScores roundNumbers={rounds.map(round => round.number)} organizerId={organizerId} />`
with `const organizerId = useSimulator()?.state.viewAs ?? DEFAULT_DEV_ACCOUNT;` near the other hooks at the top of the component (the signed-in mock account is the organizer; import `useSimulator` from `@/components/dev/SimulatorBridge` if the file doesn't already). Add `import { OrganizerScores } from "./OrganizerScores";` (and `DEFAULT_DEV_ACCOUNT` from `@/lib/dev/devAccounts` if not imported). If `rounds` items have no `number` field, read the `rounds.map(({ id, number }) …)` line near `reportNavigation` for the right field name.

- [ ] **Step 3: Types and lint**

Run: `npx tsc --noEmit -p .` and `npx eslint components/platform/OrganizerScores.tsx components/platform/GolfTripSettingsPreview.tsx`
Expected: no errors.

- [ ] **Step 4: Browser check**

Simulator → Golf Trip Active → Settings → Organizer → Player Scoring:
1. **Rounds:** Start round 1 → trip page shows Scoring even with Round state "Pre-tournament"; End round → it hides (unless your card is unsubmitted).
2. **Push-through:** on the trip, Round state **End of round — scores don't match**, open Scoring once (the live card is saved). In Player Scoring, the card is listed; Push through stays off until Allow push-through is on, both picks are made and a reason is typed; after pushing, the trip leaderboard shows the round and the Card shows ✎ on that hole.
3. **Override:** a submitted card → hole 1, strokes, new value, reason → Save change. Blank reason keeps the button off. The trip's Overview shows "Organizer's own score changes" only when the organizer changed their own card.

- [ ] **Step 5: Commit**

```bash
git add components/platform/OrganizerScores.tsx components/platform/GolfTripSettingsPreview.tsx
git commit -m "Player & Attest (dev): organizer rounds, attesters, push-through and overrides in Player Scoring"
```

---

### Task 11: `/dev/profile` — remove a round (with warning), edit marks, per-round visibility

**Files:**
- Modify: `components/dev/DevProfileRounds.tsx`

**Interfaces:**
- Consumes: `profileRounds` (Task 5), `removeFromProfile` action (Task 7), `ScoreEdit`.

- [ ] **Step 1: Implement**

1. Import `profileRounds` from `@/lib/platform/roundVisibility` and `type PlayerRound` from `@/lib/platform/playerRounds`.
2. Replace `const rounds = store.rounds.filter((r) => r.profileId === owner).sort(…)` with:

```tsx
  // Removed rounds never show; personal rounds also need to be Public for others (Player & Attest decision 11).
  const rounds = profileRounds(store.rounds, { viewerId: viewer, ownerId: owner, profileVisibility: visibility }).sort((a, b) => b.datePlayed.localeCompare(a.datePlayed));
  const summary = handicapSummary(store.rounds.filter((r) => r.profileId === owner));
  const [removing, setRemoving] = useState<PlayerRound | null>(null);
```

   (delete the old `const summary = handicapSummary(rounds);` — `handicapSummary` now skips removed rounds itself, and the handicap index must not depend on per-round visibility.)
3. In each round `<li>`, under the "Counts / Not counted" line add:

```tsx
            {round.edits?.length ? <details className="mt-1 text-sm text-ink-600"><summary>Edited by organizer</summary>
              <ul className="mt-1 list-disc pl-5">{round.edits.map((e, i) => <li key={i}>Hole {e.hole} {e.field}: {String(e.from ?? "—")} → {String(e.to ?? "—")}. {e.reason}</li>)}</ul></details> : null}
            {isOwner && <button type="button" className="mt-2 text-sm font-semibold text-maroon-900 underline" onClick={() => setRemoving(round)}>Remove from my profile</button>}
```

4. Before `</main>` add the confirmation (decision 15 wording):

```tsx
    {removing && <div role="dialog" aria-modal="true" aria-label="Remove round" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-[320px] rounded-md bg-white p-4">
        <p className="font-semibold text-ink-900">Remove this round from your profile?</p>
        <p className="mt-2 text-sm text-ink-600">All of this round&rsquo;s data will be lost from your profile, stats and handicap. This can&rsquo;t be undone.{removing.source === "trip" || removing.source === "tournament" ? " It stays on the trip's leaderboard and stats." : ""}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className={chip(false)} onClick={() => setRemoving(null)}>Keep it</button>
          <button type="button" className={chip(true)} onClick={() => { dispatchDevRounds({ type: "removeFromProfile", roundId: removing.id, profileId: owner }); setRemoving(null); }}>Remove round</button>
        </div>
      </div>
    </div>}
```

- [ ] **Step 2: Types and lint**

Run: `npx tsc --noEmit -p .` and `npx eslint components/dev/DevProfileRounds.tsx`
Expected: no errors.

- [ ] **Step 3: Browser check**

`/dev/profile` as Cade after submitting a trip round: the round shows; Remove → warning text exactly as above → Keep it does nothing; Remove round → gone from Rounds and the handicap count drops by one; the trip's leaderboard and Trip stats still include it. Viewing another account's profile shows no Remove button. An organizer-edited round shows "Edited by organizer" with the reason.

- [ ] **Step 4: Commit**

```bash
git add components/dev/DevProfileRounds.tsx
git commit -m "Player & Attest (dev): remove a round from the profile with a warning, organizer edit marks"
```

---

### Task 12: Full check and spec status

**Files:**
- Modify: `project_specs.md` (status line of the add-on only)

- [ ] **Step 1: Everything green**

Run: `npm test`, `npx tsc --noEmit -p .`, `npx eslint` on every file touched in Tasks 1–11.
Expected: all pass, no errors.

- [ ] **Step 2: Walk the spec's "Done means (Step 1 add-on)" in the browser at phone width (localhost:3001/dev)**

1. Attesters right for 2 (Singles) / 4 (Fourball, opponents) — format switch in the simulator.
2. Full match → name and total green, Submit lights; mismatch → never.
3. Submit → animation → leaderboard row F, Trip stats row, `/dev/profile` round.
4. Override and push-through → in the log, ✎ on the hole, profile "Edited by organizer".
5. Organizer's own edit → "Organizer's own score changes" on the trip.
6. Remove from profile → warning, gone from profile + handicap, still on the trip.

- [ ] **Step 3: Update the spec status**

In `project_specs.md`, change the add-on heading's `(spec 2026-10-06, approved 2026-10-06)` to `(spec 2026-10-06, approved 2026-10-06; Step 1 built <date> — dev preview)`.

- [ ] **Step 4: Commit**

```bash
git add project_specs.md
git commit -m "Player & Attest Step 1 built (dev preview)"
```
