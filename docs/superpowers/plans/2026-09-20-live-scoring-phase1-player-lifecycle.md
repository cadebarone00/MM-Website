# Live Scoring Phase 1 — Player Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a live-scoring player begin a round, see a white/red/green round status on their Scorecard, submit the round once it matches, and have handicap/archive treat it as official only when they and their scorer have both submitted.

**Architecture:** Hole entry and live views stay exactly as they are (per confirmed hole). New pure helpers compute the round status and Scoring-tab stage from the existing per-hole submission statuses. A new SQL migration stops the automatic submission, adds a lock and an explicit `submit_live_round` RPC, and adds a `submitted` archive status that handicap requires. The live Scorecard drops the competitor grid and gains the status colors and Submit Round.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Supabase (Postgres RPCs, PGlite for `npm run test:db`), `node:test` via `tsx`, Playwright harness (`npm run test:browser`).

**Spec:** `docs/superpowers/specs/2026-09-20-live-scoring-round-lifecycle-design.md` (sections 7, 9.1, 9.2, 12, 13).

**No commits:** the user has not asked for commits. Leave every change in the working tree; do not run `git add`/`git commit`.

## Global Constraints

- The other scorer's numbers are **never shown** anywhere (spec §3.6). The live Scorecard shows only the player's own entries plus a color.
- Alternate Shot (Foursome) is team-only: no putts/fairways/greens, never an individual sample, never a handicap round.
- Submit Round never changes how live data updates. Player statistics and the odds model keep reading matched holes as they arrive.
- Handicap and the rounds archive count a live round only when its archive status is `submitted` or `final`.
- After Submit Round the player's entries are locked; only Tiger can change them (there is no player "unsubmit").
- Once the player and their scorer have both submitted, the Scoring tab moves on to the next round without waiting for Tiger.
- A live round can never be deleted.
- Existing tests must keep passing: `npm test`, `npm run test:db`, `npm run test:browser`, `npx tsc --noEmit`, `npm run build`.
- The SQL migration is run by the user in the Supabase SQL Editor (explain it in plain English at the end).

## File Structure

| File | Responsibility |
|---|---|
| `lib/live/roundStatus.ts` (new) | Pure: who must submit, round card state (waiting/disputed/match), blockers |
| `lib/live/scoringStage.ts` (new) | Pure: Scoring-tab stage from progress facts |
| `lib/live/scoringProgress.ts` (new) | Server: loads holes entered, submissions, course name for the tab |
| `lib/live/currentRoundForPlayer.ts` | Skip matches the player has finished (both submitted) |
| `supabase/live_round_submission.sql` (new) | No auto-submit, lock, `submit_live_round`, `submitted` status + guard |
| `scripts/test-scoring-reliability.mjs` | PGlite tests for the migration |
| `lib/handicap/futureRoundMapping.ts`, `lib/handicap/futureRounds.ts` | Require `submitted`/`final` |
| `app/api/portal/scoring/submit/route.ts` | Thin wrapper over the RPC |
| `lib/live/holeSubmission.ts`, `lib/portal/scorecard.ts` | Rows carry the opponent score you entered |
| `components/portal/Scorecard.tsx` | Live mode: colors, totals status, Submit Round; competitor grid removed |
| `components/portal/ScoringPanel.tsx` | Wire the live Scorecard; lock after submit; realtime on submissions |
| `components/portal/ScoringStatusScreen.tsx`, `app/portal/scoring/page.tsx` | Begin/Continue and the other stages |
| `app/api/live/matches/route.ts`, `components/portal/tiger/MatchCloseoutCards.tsx` | Tiger sees who has not submitted |
| `scripts/test-scoring-browser.mjs` | Browser tests for the live Scorecard |
| `project_specs.md` | Changelog entry |

---

### Task 1: Round status logic

**Files:**
- Create: `lib/live/roundStatus.ts`
- Test: `lib/live/roundStatus.test.ts`

**Interfaces:**
- Consumes: `holeSubmissionStatus`, `scoringSides`, `submittedPair`, `HoleSubmission`, `HoleSubmissionStatus`, `ScoringPair` from `lib/live/holeSubmission.ts`.
- Produces: `RoundCardState`, `RoundBlocker`, `LiveRoundStatus`, `requiredSubmitters(box, player)`, `waitingOnSubmitters(box, player, submitted)`, `roundFinishedForPlayer(box, player, submitted)`, `liveRoundStatus(box, player, holes, submissions)`, `describeBlocker(blocker, scorerLabel)`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/live/roundStatus.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeBlocker, liveRoundStatus, requiredSubmitters, roundFinishedForPlayer, waitingOnSubmitters } from "./roundStatus.ts";
import type { HoleSubmission, ScoringPair } from "./holeSubmission.ts";

const box: ScoringPair = { format: "Singles", maroonPlayers: ["cade"], whitePlayers: ["cam"] };
const holes = [{ number: 1 }, { number: 2 }, { number: 3 }];
const entry = (player: string, hole: number, ownScore: number, opponentScore: number): HoleSubmission => ({
  player, hole, ownScore, opponentScore, putts: 2, fairway: "hit", green: "hit", submittedAt: `2027-01-01T10:0${hole}:00Z`,
});
const card = (player: string, own: number, opp: number, upTo = 3) => holes.slice(0, upTo).map((h) => entry(player, h.number, own, opp));

test("a card with no entries is waiting, names the first empty hole, and has no totals", () => {
  const status = liveRoundStatus(box, "cade", holes, []);
  assert.equal(status.state, "waiting");
  assert.deepEqual(status.blocker, { kind: "empty", hole: 1 });
  assert.equal(status.holeStates[1], "empty");
  assert.equal(status.yourTotal, null);
  assert.equal(status.opponentTotal, null);
});

test("when you have entered every hole but your scorer hasn't, the card is still waiting and shows your totals", () => {
  const status = liveRoundStatus(box, "cade", holes, card("cade", 4, 5));
  assert.equal(status.state, "waiting");
  assert.deepEqual(status.blocker, { kind: "waiting", hole: 1 });
  assert.equal(status.yourTotal, 12);
  assert.equal(status.opponentTotal, 15);
});

test("a disagreeing hole makes the card red and names that hole", () => {
  const cam = card("cam", 5, 4).map((e) => (e.hole === 2 ? { ...e, ownScore: 7 } : e));
  const status = liveRoundStatus(box, "cade", holes, [...card("cade", 4, 5), ...cam]);
  assert.equal(status.state, "disputed");
  assert.deepEqual(status.disputedHoles, [2]);
  assert.deepEqual(status.blocker, { kind: "disputed", hole: 2 });
  assert.equal(status.holeStates[1], "confirmed");
  assert.equal(status.holeStates[2], "disputed");
});

test("every hole matching makes the card green, and a later correction turns red back to green", () => {
  const matching = [...card("cade", 4, 5), ...card("cam", 5, 4)];
  const green = liveRoundStatus(box, "cade", holes, matching);
  assert.equal(green.state, "match");
  assert.equal(green.blocker, null);
  assert.equal(green.yourTotal, 12);
  const wrong = [...card("cade", 4, 5), ...card("cam", 5, 4).map((e) => (e.hole === 2 ? { ...e, ownScore: 7 } : e))];
  assert.equal(liveRoundStatus(box, "cade", holes, wrong).state, "disputed");
  const fixed = [...wrong, { ...entry("cam", 2, 5, 4), submittedAt: "2027-01-01T11:00:00Z" }];
  assert.equal(liveRoundStatus(box, "cade", holes, fixed).state, "match");
});

test("blockers read as plain sentences", () => {
  assert.equal(describeBlocker({ kind: "disputed", hole: 5 }, "Latto"), "Hole 5 doesn't match — talk with Latto");
  assert.equal(describeBlocker({ kind: "empty", hole: 7 }, "Latto"), "Hole 7 is not entered");
  assert.equal(describeBlocker({ kind: "waiting", hole: 10 }, "Latto"), "Waiting for Latto to enter hole 10");
  assert.equal(describeBlocker(null, "Latto"), null);
});

test("who must submit: you and your opposing-position scorer, never your partner; all four in Foursome", () => {
  assert.deepEqual(requiredSubmitters(box, "cade"), ["cade", "cam"]);
  const fourball: ScoringPair = { format: "Fourball", maroonPlayers: ["cade", "collin"], whitePlayers: ["cam", "drew"] };
  assert.deepEqual(requiredSubmitters(fourball, "cade"), ["cade", "cam"]);
  assert.deepEqual(requiredSubmitters(fourball, "collin"), ["collin", "drew"]);
  const foursome: ScoringPair = { ...fourball, format: "Foursome" };
  assert.deepEqual(requiredSubmitters(foursome, "cade"), ["cade", "collin", "cam", "drew"]);
});

test("a round is finished for a player only when everyone required has submitted", () => {
  assert.deepEqual(waitingOnSubmitters(box, "cade", ["cade"]), ["cam"]);
  assert.equal(roundFinishedForPlayer(box, "cade", ["cade"]), false);
  assert.equal(roundFinishedForPlayer(box, "cade", ["cade", "cam"]), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test lib/live/roundStatus.test.ts`
Expected: FAIL — `Cannot find module './roundStatus.ts'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/live/roundStatus.ts
import { holeSubmissionStatus, scoringSides, submittedPair, type HoleSubmission, type HoleSubmissionStatus, type ScoringPair } from "./holeSubmission.ts";

/** White = data missing, red = a hole disagrees, green = every hole matches. */
export type RoundCardState = "waiting" | "disputed" | "match";
export interface RoundBlocker { kind: "disputed" | "empty" | "waiting"; hole: number }

export interface LiveRoundStatus {
  state: RoundCardState;
  holeStates: Record<number, HoleSubmissionStatus>;
  disputedHoles: number[];
  /** The first reason Submit Round is unavailable, or null once the card matches. */
  blocker: RoundBlocker | null;
  /** Totals of your own entries; null until you have entered every hole. */
  yourTotal: number | null;
  opponentTotal: number | null;
}

/** Everyone who must press Submit Round before this player's round is official. */
export function requiredSubmitters(box: ScoringPair, player: string): string[] {
  if (box.format === "Foursome") return [...box.maroonPlayers, ...box.whitePlayers];
  return [player, ...scoringSides(box, player).opponents];
}

export function waitingOnSubmitters(box: ScoringPair, player: string, submitted: string[]): string[] {
  return requiredSubmitters(box, player).filter((slug) => !submitted.includes(slug));
}

export function roundFinishedForPlayer(box: ScoringPair, player: string, submitted: string[]): boolean {
  return waitingOnSubmitters(box, player, submitted).length === 0;
}

export function liveRoundStatus(box: ScoringPair, player: string, holes: { number: number }[], submissions: HoleSubmission[]): LiveRoundStatus {
  const numbers = holes.map((hole) => hole.number);
  const holeStates: Record<number, HoleSubmissionStatus> = {};
  const mine: HoleSubmission[] = [];
  for (const number of numbers) {
    holeStates[number] = holeSubmissionStatus(box, player, number, submissions);
    const entry = submittedPair(box, player, number, submissions).mine;
    if (entry) mine.push(entry);
  }
  const disputedHoles = numbers.filter((number) => holeStates[number] === "disputed");
  const allConfirmed = numbers.length > 0 && numbers.every((number) => holeStates[number] === "confirmed");
  const state: RoundCardState = disputedHoles.length > 0 ? "disputed" : allConfirmed ? "match" : "waiting";

  let blocker: RoundBlocker | null = null;
  if (disputedHoles.length > 0) blocker = { kind: "disputed", hole: disputedHoles[0] };
  else if (!allConfirmed) {
    const empty = numbers.find((number) => holeStates[number] === "empty");
    const waiting = numbers.find((number) => holeStates[number] === "submitted");
    blocker = empty != null ? { kind: "empty", hole: empty } : waiting != null ? { kind: "waiting", hole: waiting } : null;
  }

  const entered = numbers.length > 0 && mine.length === numbers.length;
  return {
    state,
    holeStates,
    disputedHoles,
    blocker,
    yourTotal: entered ? mine.reduce((sum, entry) => sum + entry.ownScore, 0) : null,
    opponentTotal: entered ? mine.reduce((sum, entry) => sum + entry.opponentScore, 0) : null,
  };
}

export function describeBlocker(blocker: RoundBlocker | null, scorerLabel: string): string | null {
  if (!blocker) return null;
  if (blocker.kind === "disputed") return `Hole ${blocker.hole} doesn't match — talk with ${scorerLabel}`;
  if (blocker.kind === "empty") return `Hole ${blocker.hole} is not entered`;
  return `Waiting for ${scorerLabel} to enter hole ${blocker.hole}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test lib/live/roundStatus.test.ts`
Expected: PASS (7 tests).

---

### Task 2: Scoring-tab stage

**Files:**
- Create: `lib/live/scoringStage.ts`
- Test: `lib/live/scoringStage.test.ts`

**Interfaces:**
- Consumes: `MatchState` from `lib/live/types.ts`, `RoundCardState` from Task 1.
- Produces: `ScoringStage`, `scoringStage(input)`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/live/scoringStage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoringStage } from "./scoringStage.ts";

const base = { hasMatch: true, matchState: "Live" as const, holesEntered: 0, roundCard: "waiting" as const, iSubmitted: false };

test("the Scoring tab stage follows the round: none, upcoming, begin, continue, ready, submitted", () => {
  assert.equal(scoringStage({ ...base, hasMatch: false, matchState: null }), "none");
  assert.equal(scoringStage({ ...base, matchState: "Scheduled" }), "upcoming");
  assert.equal(scoringStage({ ...base, matchState: "Armed" }), "upcoming");
  assert.equal(scoringStage(base), "begin");
  assert.equal(scoringStage({ ...base, holesEntered: 4 }), "continue");
  assert.equal(scoringStage({ ...base, holesEntered: 18, roundCard: "disputed" }), "continue");
  assert.equal(scoringStage({ ...base, holesEntered: 18, roundCard: "match" }), "ready");
  assert.equal(scoringStage({ ...base, holesEntered: 18, roundCard: "match", iSubmitted: true }), "submitted");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test lib/live/scoringStage.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/live/scoringStage.ts
import type { MatchState } from "./types.ts";
import type { RoundCardState } from "./roundStatus.ts";

/** What the Scoring tab shows for the player's current round. Finished rounds never reach this — they are skipped before it. */
export type ScoringStage = "none" | "upcoming" | "begin" | "continue" | "ready" | "submitted";

export function scoringStage(input: { hasMatch: boolean; matchState: MatchState | null; holesEntered: number; roundCard: RoundCardState; iSubmitted: boolean }): ScoringStage {
  if (!input.hasMatch) return "none";
  if (input.iSubmitted) return "submitted";
  if (input.matchState !== "Live") return "upcoming";
  if (input.holesEntered === 0) return "begin";
  return input.roundCard === "match" ? "ready" : "continue";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test lib/live/scoringStage.test.ts` — Expected: PASS.

---

### Task 3: The Scoring tab skips rounds you have finished

**Files:**
- Modify: `lib/live/currentRoundForPlayer.ts` (add `withoutFinishedMatches`; change `findUpcomingMatchesForPlayer`)
- Test: `lib/live/currentRoundForPlayer.test.ts` (append)

**Interfaces:**
- Consumes: `roundFinishedForPlayer` (Task 1), `CurrentRoundResult` (existing).
- Produces: `withoutFinishedMatches(matches, playerSlug, submissions)`.

- [ ] **Step 1: Write the failing test** — append to `lib/live/currentRoundForPlayer.test.ts`

```ts
import { withoutFinishedMatches } from "./currentRoundForPlayer.ts";

test("withoutFinishedMatches drops a match only when the player and their scorer have both submitted", () => {
  const singles = box({ id: "box-1", round: 1, format: "Singles", maroonPlayers: ["cam"], whitePlayers: ["drew"], state: "Live" });
  const match = { round: round({ round: 1 }), matchBox: singles, state: "Live" as const };
  const rows = (...players: string[]) => players.map((player_slug) => ({ match_box_id: "box-1", player_slug }));
  assert.equal(withoutFinishedMatches([match], "cam", []).length, 1);
  assert.equal(withoutFinishedMatches([match], "cam", rows("cam")).length, 1);
  assert.equal(withoutFinishedMatches([match], "cam", rows("cam", "drew")).length, 0);
  assert.equal(withoutFinishedMatches([match], "cam", [{ match_box_id: "other-box", player_slug: "drew" }, ...rows("cam")]).length, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test lib/live/currentRoundForPlayer.test.ts` — Expected: FAIL, `withoutFinishedMatches is not a function`.

- [ ] **Step 3: Implement** — in `lib/live/currentRoundForPlayer.ts` add the import and helper, and replace `findUpcomingMatchesForPlayer`:

```ts
import { roundFinishedForPlayer } from "./roundStatus.ts";

/** A round is finished for a player once they and their scorer have both pressed Submit Round; the Scoring tab then moves on. */
export function withoutFinishedMatches(matches: CurrentRoundResult[], playerSlug: string, submissions: { match_box_id: string; player_slug: string }[]): CurrentRoundResult[] {
  return matches.filter((match) => {
    const submitted = submissions.filter((row) => row.match_box_id === match.matchBox.id).map((row) => row.player_slug);
    return !roundFinishedForPlayer(match.matchBox, playerSlug, submitted);
  });
}

export async function findUpcomingMatchesForPlayer(playerSlug: string): Promise<CurrentRoundResult[]> {
  const matches = (await findMatchesForPlayer(playerSlug, await getActiveSeasonYear())).filter((match) => match.state !== "Final");
  const ids = matches.map((match) => match.matchBox.id).filter((id): id is string => !!id);
  if (ids.length === 0) return matches;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("live_match_box_submissions").select("match_box_id, player_slug").in("match_box_id", ids);
  if (error) {
    console.error("Failed to fetch live_match_box_submissions:", error);
    return matches;
  }
  return withoutFinishedMatches(matches, playerSlug, data ?? []);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test lib/live/currentRoundForPlayer.test.ts` and `npx tsc --noEmit` — Expected: PASS, no type errors.

---

### Task 4: SQL migration (no auto-submit, lock, `submit_live_round`, `submitted` status)

**Files:**
- Create: `supabase/live_round_submission.sql`
- Modify: `scripts/test-scoring-reliability.mjs`

**Interfaces:**
- Consumes: existing tables/functions `live_match_box_submissions`, `live_hole_scores`, `career_archive_rounds`, `live_score_audit_events`, `submit_live_hole` (in `supabase/live_hole_submissions.sql` lines 23–118).
- Produces: RPC `submit_live_round(p_box uuid, p_player text, p_actor uuid) returns jsonb` → `{ submitted: true, official: boolean, waitingOn: text[] }`; archive status `submitted`; error message for locked players: `Your round is submitted. Tiger can change it.`

- [ ] **Step 1: Confirm the DB tests pass before changing anything**

Run: `npm run test:db`
Expected: all existing `PASS:` lines, exit 0. (If PGlite is unavailable, stop and report — do not skip.)

- [ ] **Step 2: Write the failing DB tests** — in `scripts/test-scoring-reliability.mjs` add `'live_round_submission.sql'` as the last entry of the `migrations` array, then insert this block immediately before the line `const archived=randomUUID();`:

```js
  // ---- Phase 1: explicit Submit Round, lock, official-when-both-submit ----
  const box3=randomUUID();
  await db.query("insert into live_round_state(season_year,round,date,format,course_id,course_locked,matchups_locked,course_setup) values(2027,3,'2027-06-03','Singles',$1,true,true,$2)",[course,JSON.stringify({holes:setup})]);
  await db.query("insert into live_match_boxes(id,season_year,round,box_number,format,tee_time,maroon_players,white_players,state) values($1,2027,3,1,'Singles','2027-06-03','{cade-barone}','{cam-latto}','Live')",[box3]);
  await db.query("insert into career_archive_rounds(season_year,round,player_slug,course,format,match_box_id,holes) values(2027,3,'cade-barone','Test course','Singles',$1,$2),(2027,3,'cam-latto','Test course','Singles',$1,$2)",[box3,JSON.stringify(setup)]);
  await db.exec('select start_live_round_atomic(2027,3)');
  const enter3=(player,actor,hole,entry,expected=null)=>scalar('select submit_live_hole_reliable(2027,3,$1,$2,$3,$4,$5,$6,$7)',[hole,player,actor,JSON.stringify(entry),randomUUID(),box3,expected]);
  const mine3={ownScore:4,opponentScore:5,putts:2,fairway:'hit',green:'hit'}, theirs3={ownScore:5,opponentScore:4,putts:2,fairway:'hit',green:'hit'};
  for(let h=1;h<=18;h++){await enter3('cade-barone',host,h,mine3);await enter3('cam-latto',other,h,theirs3);}
  assert.equal(await scalar('select count(*)::int from live_match_box_submissions where match_box_id=$1',[box3]),0,'18 matching holes must not auto-submit');
  const submitRound=(box,player,actor)=>db.query('select submit_live_round($1,$2,$3) as r',[box,player,actor]).then((res)=>res.rows[0].r);
  const first3=await submitRound(box3,'cade-barone',host);
  assert.deepEqual(first3,{submitted:true,official:false,waitingOn:['cam-latto']});
  assert.deepEqual(await submitRound(box3,'cade-barone',host),first3);
  assert.equal(await scalar("select status from career_archive_rounds where match_box_id=$1 and player_slug='cade-barone'",[box3]),'live');
  await assert.rejects(enter3('cade-barone',host,5,{...mine3,ownScore:6}),/Your round is submitted/);
  let camSaved=await scalar("select submitted_at::text from live_hole_submissions where match_box_id=$1 and player_slug='cam-latto' and hole=5",[box3]);
  await enter3('cam-latto',other,5,{...theirs3,ownScore:7},camSaved);
  assert.equal(await scalar("select count(*)::int from live_match_box_submissions where match_box_id=$1 and player_slug='cade-barone'",[box3]),1,"a scorer's later edit never un-submits anyone");
  await assert.rejects(submitRound(box3,'cam-latto',other),/Hole 5/);
  camSaved=await scalar("select submitted_at::text from live_hole_submissions where match_box_id=$1 and player_slug='cam-latto' and hole=5",[box3]);
  await enter3('cam-latto',other,5,theirs3,camSaved);
  assert.deepEqual(await submitRound(box3,'cam-latto',other),{submitted:true,official:true,waitingOn:[]});
  assert.equal(await scalar("select count(*)::int from career_archive_rounds where match_box_id=$1 and status='submitted'",[box3]),2);
  await db.query('update live_hole_scores set putts=putts where season_year=2027 and round=3 and hole=1');
  assert.equal(await scalar("select count(*)::int from career_archive_rounds where match_box_id=$1 and status='submitted'",[box3]),2,'a later score write never moves an official round back to live');
  console.log('PASS: Submit Round is explicit, locks the player, survives a scorer edit, and is official only when both submit');
  const collin=randomUUID(), drew=randomUUID(), box4=randomUUID();
  await db.query('insert into auth.users values ($1),($2)',[collin,drew]);
  await db.query("insert into profiles(id,email,display_name,username,is_host,player_slug) values($1,'collin@test','Collin','collin',false,'collin-ross'),($2,'drew@test','Drew','drew',false,'drew-weisser')",[collin,drew]);
  await db.query("insert into live_round_state(season_year,round,date,format,course_id,course_locked,matchups_locked,course_setup) values(2027,4,'2027-06-04','Foursome',$1,true,true,$2)",[course,JSON.stringify({holes:setup})]);
  await db.query("insert into live_match_boxes(id,season_year,round,box_number,format,tee_time,maroon_players,white_players,state) values($1,2027,4,1,'Foursome','2027-06-04','{cade-barone,collin-ross}','{cam-latto,drew-weisser}','Live')",[box4]);
  await db.query("insert into career_archive_rounds(season_year,round,player_slug,course,format,match_box_id,holes) values(2027,4,'cade-barone','Test course','Foursome',$1,$2),(2027,4,'collin-ross','Test course','Foursome',$1,$2),(2027,4,'cam-latto','Test course','Foursome',$1,$2),(2027,4,'drew-weisser','Test course','Foursome',$1,$2)",[box4,JSON.stringify(setup)]);
  await db.exec('select start_live_round_atomic(2027,4)');
  const four=[['cade-barone',host,4,5],['collin-ross',collin,4,5],['cam-latto',other,5,4],['drew-weisser',drew,5,4]];
  for(let h=1;h<=18;h++)for(const [player,actor,own,opp] of four)await db.query('select submit_live_hole_reliable(2027,4,$1,$2,$3,$4,$5,$6,null)',[h,player,actor,JSON.stringify({ownScore:own,opponentScore:opp,putts:null,fairway:null,green:null}),randomUUID(),box4]);
  for(const [player,actor] of four.slice(0,3)) assert.equal((await submitRound(box4,player,actor)).official,false);
  assert.deepEqual(await submitRound(box4,'drew-weisser',drew),{submitted:true,official:true,waitingOn:[]});
  assert.equal(await scalar("select count(*)::int from career_archive_rounds where match_box_id=$1 and status='submitted'",[box4]),4);
  console.log('PASS: Foursome needs all four players to submit before the round is official');
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:db`
Expected: FAIL — the migration file `live_round_submission.sql` does not exist (`ENOENT`).

- [ ] **Step 4: Write the migration (static part)** — create `supabase/live_round_submission.sql` with this content (the marker line is replaced in Step 5):

```sql
-- Run once in the Supabase SQL Editor AFTER live_hole_submissions.sql and
-- scoring_reliability.sql. Live scoring Phase 1 ("Submit Round"):
--   1. A player's round is no longer submitted automatically at 18 matching
--      holes; the player must press Submit Round.
--   2. After Submit Round the player's own entries are locked (only Tiger can
--      change them); a scorer's later disagreement never un-submits anyone.
--   3. When a player AND their scorer have both submitted, the archive round
--      becomes 'submitted' (an official record: handicap and the archive
--      count it). Foursome needs all four players.
begin;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'career_archive_rounds'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table career_archive_rounds drop constraint %I', c);
  end loop;
end $$;
alter table career_archive_rounds add constraint career_archive_rounds_status_check
  check (status in ('scheduled', 'live', 'submitted', 'final'));

-- Later score writes (a live mirror, a Tiger edit) must never move an
-- official round back to 'live'.
create or replace function public.keep_archive_round_status() returns trigger
language plpgsql as $$
begin
  if old.status = 'final' and new.status in ('scheduled', 'live', 'submitted') then new.status := old.status;
  elsif old.status = 'submitted' and new.status in ('scheduled', 'live') then new.status := old.status;
  end if;
  return new;
end $$;
drop trigger if exists keep_archive_round_status_trigger on career_archive_rounds;
create trigger keep_archive_round_status_trigger before update on career_archive_rounds
  for each row execute function public.keep_archive_round_status();

-- @@SUBMIT_LIVE_HOLE@@

create or replace function public.submit_live_round(p_box uuid, p_player text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b live_match_boxes%rowtype;
  r live_round_state%rowtype;
  v_own text[]; v_other text[]; v_required text[]; v_waiting text[];
  h jsonb; v_par integer; v_hole integer; v_target text;
  v_row live_hole_scores%rowtype;
  v_official boolean;
begin
  if not exists (select 1 from profiles where id = p_actor and player_slug = p_player) then raise exception 'Not authorized.'; end if;
  select * into b from live_match_boxes where id = p_box and p_player = any(maroon_players || white_players) for update;
  if not found then raise exception 'No assigned match.'; end if;
  if not b.started or b.state = 'Final' or (b.state <> 'Live' and b.tee_time > now()) then
    raise exception 'This match is not open for scoring.';
  end if;
  select * into r from live_round_state where season_year = b.season_year and round = b.round;
  if p_player = any(b.maroon_players) then v_own := b.maroon_players; v_other := b.white_players;
  else v_own := b.white_players; v_other := b.maroon_players; end if;
  if b.format = 'Foursome' then v_required := b.maroon_players || b.white_players;
  else v_required := array[p_player, v_other[array_position(v_own, p_player)]]; end if;

  if not exists (select 1 from live_match_box_submissions where match_box_id = p_box and player_slug = p_player) then
    for v_hole in 1..18 loop
      select item into h from jsonb_array_elements(coalesce(r.course_setup->'holes', (select holes from live_courses where id = r.course_id), '[]'::jsonb)) item
        where (item->>'number')::integer = v_hole;
      v_par := (h->>'par')::integer;
      foreach v_target in array v_required loop
        select * into v_row from live_hole_scores
          where season_year = b.season_year and round = b.round and hole = v_hole and player_slug = v_target;
        if not found or v_row.score is null or v_row.score <= 0 or v_row.confirmed_by is null then
          raise exception 'Hole % is not confirmed yet. You and your scorer must both enter and match every hole before you submit.', v_hole;
        end if;
      end loop;
      if b.format <> 'Foursome' then
        select * into v_row from live_hole_scores
          where season_year = b.season_year and round = b.round and hole = v_hole and player_slug = p_player;
        if not v_row.did_not_finish and (v_row.putts is null or v_row.gir is null or (v_par is distinct from 3 and v_row.fir is null)) then
          raise exception 'Finish your putts, fairway, and green for hole % before you submit.', v_hole;
        end if;
      end if;
    end loop;
    insert into live_match_box_submissions(match_box_id, player_slug) values (p_box, p_player)
      on conflict (match_box_id, player_slug) do nothing;
    insert into live_score_audit_events(season_year, match_box_id, round, player_slug, actor_profile_id, kind, payload)
      values (b.season_year, p_box, b.round, p_player, p_actor, 'player_submitted', jsonb_build_object('holes', 18));
  end if;

  select coalesce(array_agg(x), '{}') into v_waiting from unnest(v_required) x
    where not exists (select 1 from live_match_box_submissions where match_box_id = p_box and player_slug = x);
  v_official := cardinality(v_waiting) = 0;
  if v_official then
    update career_archive_rounds set status = 'submitted', updated_at = now()
      where match_box_id = p_box and player_slug = any(v_required) and status in ('scheduled', 'live');
  end if;
  return jsonb_build_object('submitted', true, 'official', v_official, 'waitingOn', to_jsonb(v_waiting));
end $$;
revoke all on function public.submit_live_round(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_live_round(uuid, text, uuid) to service_role;

commit;
```

- [ ] **Step 5: Generate the `submit_live_hole` replacement from the original (exact copy plus two edits)** — run:

```bash
python - <<'EOF'
import io
src = io.open("supabase/live_hole_submissions.sql", encoding="utf-8", newline="").read().replace("\r\n", "\n")
start = src.index("create or replace function public.submit_live_hole(")
end = src.index("\n$$;\n", start) + len("\n$$;\n")
fn = src[start:end]

anchor = "  if not found then raise exception 'No assigned match.'; end if;\n"
assert fn.count(anchor) == 1
fn = fn.replace(anchor, anchor + "  if exists (select 1 from live_match_box_submissions where match_box_id = b.id and player_slug = p_player) then\n    raise exception 'Your round is submitted. Tiger can change it.';\n  end if;\n")

old_start = fn.index("    -- The existing mirror trigger publishes confirmed rows and retracts disputed ones.")
old_end = fn.index("    end if;\n", fn.index("delete from live_match_box_submissions", old_start)) + len("    end if;\n")
fn = fn[:old_start] + "    -- The existing mirror trigger publishes confirmed rows and retracts disputed ones.\n    -- Submitting the round is now explicit (submit_live_round), never automatic.\n" + fn[old_end:]

p = "supabase/live_round_submission.sql"
out = io.open(p, encoding="utf-8", newline="").read()
assert out.count("-- @@SUBMIT_LIVE_HOLE@@") == 1
io.open(p, "w", encoding="utf-8", newline="").write(out.replace("-- @@SUBMIT_LIVE_HOLE@@", fn.rstrip("\n")))
print("ok")
EOF
grep -c "live_match_box_submissions" supabase/live_round_submission.sql
```
Expected: `ok`. Then open the generated function and confirm it has the new `Your round is submitted` check and no longer contains `delete from live_match_box_submissions`.

- [ ] **Step 6: Run to verify it passes**

Run: `npm run test:db`
Expected: every earlier `PASS:` line plus the two new ones, exit 0. If the Foursome insert fails on a `player_slots` foreign key, insert the two missing slots (see `supabase/schema.sql` for the columns) before the `career_archive_rounds` insert and re-run.

---

### Task 5: Handicap counts only official rounds

**Files:**
- Modify: `lib/handicap/futureRoundMapping.ts`, `lib/handicap/futureRounds.ts`
- Test: `lib/handicap/futureRoundMapping.test.ts`

**Interfaces:**
- Consumes: `career_archive_rounds.status`.
- Produces: `FutureRoundRow.status: string`; `mapFutureHandicapRounds` ignores rows whose status is not `submitted` or `final`.

- [ ] **Step 1: Write the failing test** — in `lib/handicap/futureRoundMapping.test.ts` change the shared row to `const row = { season_year: 2028, round: 1, course: "Old name", played_on: "2028-06-01", format: "Singles", handicap_setup: tee, status: "final" };` and append:

```ts
test("only submitted or final rounds count toward handicap; live and scheduled rounds do not", () => {
  assert.deepEqual(mapFutureHandicapRounds([{ ...row, status: "live" }], holes, []), []);
  assert.deepEqual(mapFutureHandicapRounds([{ ...row, status: "scheduled" }], holes, []), []);
  assert.equal(mapFutureHandicapRounds([{ ...row, status: "submitted" }], holes, []).length, 1);
  assert.equal(mapFutureHandicapRounds([{ ...row, status: "final" }], holes, []).length, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test lib/handicap/futureRoundMapping.test.ts` — Expected: FAIL on the new test (a `live` round is still mapped).

- [ ] **Step 3: Implement** — in `futureRoundMapping.ts` add `status: string;` to `FutureRoundRow` and, as the first line inside the `rows.flatMap((row) => {` callback, add `if (row.status !== "submitted" && row.status !== "final") return [];`. In `futureRounds.ts` add `status` to the select: `.select("season_year, round, course, played_on, format, handicap_setup, status")`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test lib/handicap/futureRoundMapping.test.ts` and `npx tsc --noEmit` — Expected: PASS, clean.

---

### Task 6: Submit route calls the RPC

**Files:**
- Modify (replace contents): `app/api/portal/scoring/submit/route.ts`
- Test: `app/api/portal/scoring/submit/route.test.ts` (existing, must still pass)

**Interfaces:**
- Consumes: RPC `submit_live_round` (Task 4).
- Produces: `POST /api/portal/scoring/submit` body `{ round: number }` → `{ ok: true, submitted: true, official: boolean, waitingOn: string[] }` or `{ ok: false, error }` (400 for rule failures, 503 otherwise).

- [ ] **Step 1: Replace the route** — full new contents of `app/api/portal/scoring/submit/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";

/** Submit Round: all the rules live in the submit_live_round RPC so the check and the save are one transaction. */
export async function POST(request: Request) {
  const player = await requirePlayer();
  if (!player) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });

  const { round } = await request.json();
  if (typeof round !== "number" || !Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();
  const { data: boxRows } = await service
    .from("live_match_boxes")
    .select("id, maroon_players, white_players")
    .eq("season_year", seasonYear)
    .eq("round", round);
  const box = (boxRows ?? []).find((b) => (b.maroon_players as string[]).includes(player.playerSlug) || (b.white_players as string[]).includes(player.playerSlug));
  if (!box) return NextResponse.json({ ok: false, error: "You don't have a match box in this round." }, { status: 404 });

  const { data, error } = await service.rpc("submit_live_round", { p_box: box.id, p_player: player.playerSlug, p_actor: player.userId });
  if (error) {
    const rule = error.code === "P0001";
    if (!rule) console.error("Round submission failed:", error);
    return NextResponse.json({ ok: false, error: rule ? error.message : "Could not submit your round. Please try again." }, { status: rule ? 400 : 503 });
  }
  return NextResponse.json({ ok: true, ...data });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsx --test app/api/portal/scoring/submit/route.test.ts` and `npx tsc --noEmit` — Expected: PASS, clean.

