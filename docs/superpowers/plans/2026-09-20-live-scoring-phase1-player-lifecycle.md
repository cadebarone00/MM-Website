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

---

### Task 7: Live Scorecard rows carry the score you entered for your opponent

**Files:**
- Modify: `lib/portal/scorecard.ts`, `lib/live/holeSubmission.ts`
- Test: `lib/live/holeSubmission.test.ts`

**Interfaces:**
- Produces: `ScorecardHoleRow.opponentScore?: number | null` (only set by the live builder; handicap rows leave it undefined).

- [ ] **Step 1: Write the failing test** — in `lib/live/holeSubmission.test.ts`, change the expected rows in the test `buildScorecardRows fills a row from a player's own submission...` to include the new field (`opponentScore: 5` on hole 1, `opponentScore: null` on hole 2), i.e.:

```ts
  assert.deepEqual(rows[0], { hole: 1, par: 4, yards: 410, score: 4, opponentScore: 5, putts: 2, fir: true, firDirection: null, gir: false, girDirection: "short" });
  assert.deepEqual(rows[1], { hole: 2, par: 3, yards: 165, score: null, opponentScore: null, putts: null, fir: null, firDirection: null, gir: null, girDirection: null });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test lib/live/holeSubmission.test.ts` — Expected: FAIL (`opponentScore` missing from the row).

- [ ] **Step 3: Implement** — in `lib/portal/scorecard.ts` add `opponentScore?: number | null; // live scoring only: the score you entered for the person you scored` to `ScorecardHoleRow` (after `score`). In `buildScorecardRows` in `lib/live/holeSubmission.ts` add `opponentScore: entry?.opponentScore ?? null,` right after the `score: entry?.ownScore ?? null,` line.

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test lib/live/holeSubmission.test.ts lib/portal/scorecard.test.ts` and `npx tsc --noEmit` — Expected: PASS, clean.

---

### Task 8: Scorecard live mode (colors, status totals, Submit Round; competitor grid removed)

**Files:**
- Replace contents: `components/portal/Scorecard.tsx`

**Interfaces:**
- Consumes: `ScorecardHoleRow` (with `opponentScore`), `scorecardTotals`, `isRoundComplete`, `firstIncompleteHole`, `RoundStatsBox`, `ScoreToParHeader`, `formatToPar`.
- Produces: `Scorecard` props `{ rows, totalScore, toPar, onEditHole, onBack, showTotals?, live?: LiveScorecard, onSubmit?, submitting?, submitError? }` and exported type `LiveScorecard { opponentLabel: string; holeStates: Record<number, "empty"|"submitted"|"confirmed"|"disputed">; state: "waiting"|"disputed"|"match"; yourTotal: number|null; opponentTotal: number|null; blocker: string|null; submitted: boolean; note: string|null }`. The `competitor` prop and `ScorecardCompetitor` type are **removed** (any remaining importer must be updated — only `ScoringPanel.tsx` used them, fixed in Task 9). The totals element carries `data-round-state`, the hole-number buttons keep `aria-label="Edit hole N"` and get `bg-red-600` when disputed.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { firstIncompleteHole, isRoundComplete, scorecardTotals, type ScorecardHoleRow, type ScorecardShotDirection, type ScorecardTotals } from "@/lib/portal/scorecard";
import { formatToPar } from "@/lib/handicap/format";
import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import { RoundStatsBox } from "@/components/scorecard/RoundStatsBox";
import { ScoreToParHeader } from "./ScoreToParHeader";

type HoleState = "empty" | "submitted" | "confirmed" | "disputed";

const CELL_HEIGHT = "h-9";
const COLUMN_WIDTH = "w-12";

function Cell({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${CELL_HEIGHT} ${last ? "" : "border-b border-ink-100"}`}>
      {children}
    </div>
  );
}

function Dash() {
  return <span className="font-sans text-xs text-ink-300">{"–"}</span>;
}

/** Hit = green check; a recorded miss direction becomes the matching arrow; anything else that counts as a miss (a plain false, or GIR's "penalty") falls back to a red X. Null means "not applicable" or "not entered yet" and both render the same dash here. */
function ShotCell({ hit, direction, notApplicable }: { hit: boolean | null; direction: ScorecardShotDirection | null; notApplicable?: boolean }) {
  if (notApplicable) return <span className="font-sans text-2xs text-ink-300">N/A</span>;
  if (hit == null) return <Dash />;
  if (hit) return <Check size={16} aria-label="Hit" className="text-emerald-600" />;
  const DirectionIcon = direction === "long" ? ArrowUp : direction === "short" ? ArrowDown : direction === "left" ? ArrowLeft : direction === "right" ? ArrowRight : null;
  return DirectionIcon
    ? <DirectionIcon size={16} aria-label={"Missed " + direction} className="text-red-600" />
    : <X size={16} aria-label="Missed" className="text-red-600" />;
}

function ScoreCell({ score, par }: { score: number | null; par: number }) {
  if (score == null) return <Dash />;
  return <HoleMarkerForDiff diff={score - par} size={26}>{score}</HoleMarkerForDiff>;
}

function LabelColumn({ labels }: { labels: string[] }) {
  return (
    <div className="flex w-[76px] shrink-0 flex-col border-r border-ink-200 bg-cream-50">
      {labels.map((label, i) => (
        <Cell key={label} last={i === labels.length - 1}>
          <span className="w-full truncate px-2 font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        </Cell>
      ))}
    </div>
  );
}

/** Live: a hole where you and your scorer disagree turns red; one still waiting on your scorer is muted. */
function holeNumberClass(state: HoleState | undefined): string {
  if (state === "disputed") return "bg-red-600 text-white";
  if (state === "submitted") return "text-ink-400";
  return "text-maroon-800";
}

function HoleColumn({ row, holeState, showOpponent, onEdit }: { row: ScorecardHoleRow; holeState?: HoleState; showOpponent: boolean; onEdit: () => void }) {
  const par3 = row.par === 3;
  return (
    <div className={`flex ${COLUMN_WIDTH} shrink-0 flex-col border-r border-ink-100 last:border-r-0`}>
      <Cell><button type="button" onClick={onEdit} aria-label={"Edit hole " + row.hole} className={`min-w-7 rounded px-1.5 py-0.5 font-sans text-sm font-bold ${holeNumberClass(holeState)}`}>{row.hole}</button></Cell>
      <Cell><span className="font-sans text-2xs text-ink-500">{row.yards}</span></Cell>
      <Cell><ScoreCell score={row.score} par={row.par} /></Cell>
      {showOpponent && <Cell>{row.opponentScore != null ? <span className="font-sans text-xs font-semibold text-ink-700">{row.opponentScore}</span> : <Dash />}</Cell>}
      <Cell><span className="font-sans text-xs text-ink-700">{row.putts ?? <Dash />}</span></Cell>
      <Cell><ShotCell hit={row.fir} direction={row.firDirection} notApplicable={par3} /></Cell>
      <Cell last><ShotCell hit={row.gir} direction={row.girDirection} /></Cell>
    </div>
  );
}

/** The horizontal grid: a fixed row-label column, then one scrollable column per hole. Live scoring adds a row for the score you entered for your opponent. */
function ScorecardGrid({ rows, live, onEditHole }: { rows: ScorecardHoleRow[]; live?: LiveScorecard; onEditHole: (hole: number) => void }) {
  const labels = live
    ? ["Hole", "Yardage", "Score", live.opponentLabel, "Putts", "Fairway", "Green"]
    : ["Hole", "Yardage", "Score", "Putts", "Fairway", "Green"];
  return (
    <div className="flex overflow-hidden rounded-sm border border-ink-200">
      <LabelColumn labels={labels} />
      <div className="flex flex-1 overflow-x-auto">
        {rows.map((row) => <HoleColumn key={row.hole} row={row} holeState={live?.holeStates[row.hole]} showOpponent={!!live} onEdit={() => onEditHole(row.hole)} />)}
      </div>
    </div>
  );
}

function percent({ hit, total }: { hit: number; total: number }): string {
  return total > 0 ? Math.round((hit / total) * 100) + "%" : "—";
}

/** The same five-across box as the player profiles' archived rounds, for this round so far. */
function totalsStats(totals: ScorecardTotals) {
  return [
    { label: "Score", value: totals.score == null ? "—" : String(totals.score) },
    { label: "To Par", value: formatToPar(totals.toPar) },
    { label: "Putts", value: totals.putts == null ? "—" : String(totals.putts) },
    { label: "Fairways", value: percent(totals.fairways), note: totals.fairways.total > 0 ? `${totals.fairways.hit}/${totals.fairways.total}` : undefined },
    { label: "Greens", value: percent(totals.greens), note: totals.greens.total > 0 ? `${totals.greens.hit}/${totals.greens.total}` : undefined },
  ];
}

/** "After you submit you can't edit" - the last check before a round is sent in. Keep editing is the default focus so a stray tap can't submit. */
function ConfirmSubmitDialog({ message, label, submitting, error, onSubmit, onKeepEditing }: { message: string; label: string; submitting?: boolean; error?: string | null; onSubmit: () => void; onKeepEditing: () => void }) {
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { keepEditingRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) onKeepEditing(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onKeepEditing]);
  // Portaled to the page root so no ancestor's stacking context can put the site header on top of it.
  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-submit-title" aria-describedby="confirm-submit-body" className="w-full max-w-sm rounded-md bg-white p-5 shadow-xl">
        <h2 id="confirm-submit-title" className="font-serif text-xl font-bold text-ink-900">Confirm</h2>
        <p id="confirm-submit-body" className="mt-2 font-sans text-sm text-ink-700">{message}</p>
        {error && <p aria-live="polite" className="mt-3 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={submitting} onClick={onSubmit} className="w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white disabled:opacity-50">
            {submitting ? "Submitting…" : label}
          </button>
          <button ref={keepEditingRef} type="button" disabled={submitting} onClick={onKeepEditing} className="w-full rounded-pill border border-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-maroon-700 disabled:opacity-50">
            Keep editing
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Live scoring's view of the round: your own entries plus a color for whether you and your scorer agree — never your scorer's numbers. */
export interface LiveScorecard {
  /** Last name of the person you are scoring, used for the second score row and the status text. */
  opponentLabel: string;
  holeStates: Record<number, HoleState>;
  /** white = data missing, red = a hole disagrees, green = everything matches. */
  state: "waiting" | "disputed" | "match";
  yourTotal: number | null;
  opponentTotal: number | null;
  /** Why Submit Round is unavailable right now (null once the card matches). */
  blocker: string | null;
  /** You already pressed Submit Round: the card is read-only. */
  submitted: boolean;
  note: string | null;
}

const STATE_TONES: Record<LiveScorecard["state"], string> = {
  waiting: "border-ink-200 bg-white text-ink-700",
  disputed: "border-red-500 bg-red-50 text-red-700",
  match: "border-emerald-500 bg-emerald-50 text-emerald-700",
};

/**
 * Full hole-by-hole scorecard: a horizontally-scrolling grid — tap a hole
 * number to jump back and fix it. Shared by the handicap "Submit a score"
 * flow and live scoring. `showTotals` adds the round-totals box; `onSubmit`
 * adds the Submit Round pill, which asks for confirmation first. `live`
 * switches on live-scoring mode: a second score row (what you entered for
 * your opponent), red/muted hole numbers, and a white/red/green status for
 * whether you and your scorer agree.
 */
export function Scorecard({
  rows,
  totalScore,
  toPar,
  onEditHole,
  onBack,
  showTotals,
  live,
  onSubmit,
  submitting,
  submitError,
}: {
  rows: ScorecardHoleRow[];
  totalScore: number;
  toPar: number | null;
  onEditHole: (hole: number) => void;
  onBack: () => void;
  showTotals?: boolean;
  live?: LiveScorecard;
  onSubmit?: () => void;
  submitting?: boolean;
  submitError?: string | null;
}) {
  const complete = isRoundComplete(rows);
  const nextIncomplete = firstIncompleteHole(rows);
  const [confirming, setConfirming] = useState(false);
  const pillEnabled = live ? live.state === "match" && !live.submitted : complete;

  return (
    <div className="rounded-md border border-ink-100 bg-white p-3">
      <button type="button" onClick={onBack} disabled={submitting} className="mb-2 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Back</button>
      <ScoreToParHeader totalScore={totalScore} toPar={toPar} />
      <p className="mt-2 text-center font-sans text-2xs uppercase tracking-wide text-ink-400">Tap hole number to edit</p>
      {live && <p className="text-center font-sans text-2xs uppercase tracking-wide text-ink-400">Scores as you entered them</p>}

      <div className="mt-3"><ScorecardGrid rows={rows} live={live} onEditHole={onEditHole} /></div>

      {live && (
        <div data-round-state={live.state} className={`mt-3 rounded-sm border px-3 py-2 ${STATE_TONES[live.state]}`}>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="font-condensed text-2xs font-semibold uppercase tracking-wide">Your score</p>
              <p className="font-sans text-xl font-black tabular-nums">{live.yourTotal ?? "—"}</p>
            </div>
            <div>
              <p className="font-condensed text-2xs font-semibold uppercase tracking-wide">{live.opponentLabel}&apos;s score</p>
              <p className="font-sans text-xl font-black tabular-nums">{live.opponentTotal ?? "—"}</p>
            </div>
          </div>
          <p className="mt-1 text-center font-sans text-xs">{live.note ?? (live.state === "match" ? "Your card matches. You can submit your round." : live.blocker)}</p>
        </div>
      )}

      {!complete && nextIncomplete != null && !live?.submitted && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-sm bg-gold-200 px-3 py-2">
          <span className="font-sans text-sm text-ink-700">Not every hole is entered yet.</span>
          <button type="button" onClick={() => onEditHole(nextIncomplete)} className="shrink-0 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700 underline">
            Go to hole {nextIncomplete}
          </button>
        </div>
      )}

      {showTotals && <div className="mt-4"><RoundStatsBox stats={totalsStats(scorecardTotals(rows))} /></div>}

      {onSubmit && (
        <div className="mt-3">
          <button
            type="button"
            disabled={!pillEnabled || submitting}
            onClick={() => setConfirming(true)}
            className={`w-full rounded-pill bg-maroon-700 px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-wide text-white ${live ? "disabled:bg-ink-200 disabled:text-ink-500" : "disabled:opacity-50"}`}
          >
            {live ? (live.submitted ? "Submitted" : "Submit Round") : complete ? "Submit Round" : "Finish all 18 holes to submit"}
          </button>
        </div>
      )}
      {onSubmit && confirming && (
        <ConfirmSubmitDialog
          message={live ? "After you submit your round you will not be able to edit it. Tiger can correct it later if something is wrong." : "After you submit scores you will not be able to edit them."}
          label={live ? "Submit Round" : "Submit Scores"}
          submitting={submitting}
          error={submitError}
          onSubmit={onSubmit}
          onKeepEditing={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify (types fail until Task 9 removes the old `competitor` usage — expected)**

Run: `npx tsc --noEmit` — Expected: the only errors are in `components/portal/ScoringPanel.tsx` (it still passes `competitor`). The handicap flow still type-checks. Proceed to Task 9.

---

### Task 9: Wire the live Scorecard into ScoringPanel

**Files:**
- Modify: `components/portal/ScoringPanel.tsx`

**Interfaces:**
- Consumes: `Scorecard` + `LiveScorecard` (Task 8), `liveRoundStatus`, `describeBlocker`, `waitingOnSubmitters` (Task 1), `POST /api/portal/scoring/submit` (Task 6), `state.submittedPlayers` (already returned by `/api/portal/scoring/state`).

- [ ] **Step 1: Apply the edits** — run this script from the repo root (each replacement asserts exactly one match; if an assertion fails, open the file, adapt the anchor to the current text, and re-run):

```bash
python - <<'EOF'
import io
p = "components/portal/ScoringPanel.tsx"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
s = s.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, old[:90]
    s = s.replace(old, new)

rep('import { ScoringHoleSelector } from "./ScoringHoleSelector";',
    'import { describeBlocker, liveRoundStatus, waitingOnSubmitters } from "@/lib/live/roundStatus";\nimport { ScoringHoleSelector } from "./ScoringHoleSelector";')
rep("  const [showScorecard, setShowScorecard] = useState(false);",
    "  const [showScorecard, setShowScorecard] = useState(false);\n  const [submittingRound, setSubmittingRound] = useState(false);\n  const [roundError, setRoundError] = useState<string | null>(null);")
rep('table: "live_hole_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load).subscribe();',
    'table: "live_hole_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load)\n      .on("postgres_changes", { event: "*", schema: "public", table: "live_match_box_submissions", filter: `match_box_id=eq.${matchBox.id}` }, load).subscribe();')
rep('  const locked = busy || queue.sending || state.matchBox.state === "Final";',
    '  const mySubmitted = state.submittedPlayers.includes(playerSlug);\n  const locked = busy || queue.sending || state.matchBox.state === "Final" || mySubmitted;')
rep(': status === "disputed" ? <p role="alert">Scores disagree.',
    ': mySubmitted ? <p>Your round is submitted. Tiger can change it.</p> : status === "disputed" ? <p role="alert">Scores disagree.')

start = s.index("  if (showScorecard) {")
end = s.index("  const rowClass =")
new_branch = '''  async function submitRound() {
    setSubmittingRound(true); setRoundError(null);
    try {
      const res = await fetch("/api/portal/scoring/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round }) });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error ?? "Could not submit your round.");
      await load();
    } catch (err) { setRoundError(err instanceof Error ? err.message : "Could not submit your round. Check your connection and try again."); }
    finally { setSubmittingRound(false); }
  }
  if (showScorecard) {
    const rows = buildScorecardRows(state.holes, playerSlug, submissions, matchBox.format);
    const enteredRows = rows.filter((row) => row.score != null);
    const scorecardTotal = enteredRows.reduce((sum, row) => sum + (row.score ?? 0), 0);
    const scorecardToPar = enteredRows.length > 0 ? scorecardTotal - enteredRows.reduce((sum, row) => sum + row.par, 0) : null;
    const roundStatus = liveRoundStatus(matchBox, playerSlug, state.holes, submissions);
    const waitingOn = waitingOnSubmitters(matchBox, playerSlug, state.submittedPlayers).filter((slug) => slug !== playerSlug).map((slug) => getPlayerLastName(nameBySlug[slug] ?? slug));
    return (
      <Scorecard
        rows={rows}
        totalScore={scorecardTotal}
        toPar={scorecardToPar}
        onEditHole={(hole) => { select(hole); setShowScorecard(false); }}
        onBack={() => setShowScorecard(false)}
        showTotals
        live={{
          opponentLabel: targetLabel,
          holeStates: roundStatus.holeStates,
          state: roundStatus.state,
          yourTotal: roundStatus.yourTotal,
          opponentTotal: roundStatus.opponentTotal,
          blocker: describeBlocker(roundStatus.blocker, targetLabel),
          submitted: mySubmitted,
          note: mySubmitted ? (waitingOn.length > 0 ? `Submitted \\u2014 waiting on ${waitingOn.join(" & ")}` : "Submitted \\u2014 your round is official") : null,
        }}
        onSubmit={previewState ? undefined : () => void submitRound()}
        submitting={submittingRound}
        submitError={roundError}
      />
    );
  }

'''
s = s[:start] + new_branch + s[end:]
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
EOF
npx tsc --noEmit
```
Expected: `ok`, then no type errors.

- [ ] **Step 2: Lint**

Run: `npx eslint components/portal/Scorecard.tsx components/portal/ScoringPanel.tsx lib/live` — Expected: clean.

---

### Task 10: The Scoring tab — full matchup, Begin/Continue, and the other stages

**Files:**
- Create: `lib/live/scoringProgress.ts`
- Replace contents: `components/portal/ScoringStatusScreen.tsx`
- Modify: `app/portal/scoring/page.tsx`

**Interfaces:**
- Consumes: `CurrentRoundResult`, `matchupLabel` (existing), `liveRoundStatus`, `waitingOnSubmitters` (Task 1), `scoringStage`/`ScoringStage` (Task 2), `scoringSides`.
- Produces: `loadScoringProgress(result, playerSlug): Promise<ScoringProgress>`; `ScoringStatusScreen` props `{ playerName, playerSlug, result, stage, progress }`.

- [ ] **Step 1: Write the progress loader**

```ts
// lib/live/scoringProgress.ts
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CurrentRoundResult } from "./currentRoundForPlayer.ts";
import { submittedPair, type HoleDraft, type HoleSubmission } from "./holeSubmission.ts";
import { liveRoundStatus, waitingOnSubmitters, type RoundCardState } from "./roundStatus.ts";

const HOLES = Array.from({ length: 18 }, (_, i) => ({ number: i + 1 }));

export interface ScoringProgress {
  holesEntered: number;
  roundCard: RoundCardState;
  iSubmitted: boolean;
  /** Player slugs still to submit, excluding the player themselves. */
  waitingOn: string[];
  courseName: string | null;
}

// Not unit tested: it needs a real request lifecycle (same documented limitation as findMatchesForPlayer).
// The decisions it feeds are tested: liveRoundStatus, waitingOnSubmitters and scoringStage.
export async function loadScoringProgress(result: CurrentRoundResult, playerSlug: string): Promise<ScoringProgress> {
  const boxId = result.matchBox.id;
  const courseId = result.round.courseId;
  const supabase = await createSupabaseServerClient();
  const service = createSupabaseServiceRoleClient();
  const [holeRows, submittedRows, course] = await Promise.all([
    boxId ? supabase.from("live_hole_submissions").select("player_slug, hole, payload, submitted_at").eq("match_box_id", boxId) : Promise.resolve({ data: [] }),
    boxId ? supabase.from("live_match_box_submissions").select("player_slug").eq("match_box_id", boxId) : Promise.resolve({ data: [] }),
    courseId ? service.from("live_courses").select("name").eq("id", courseId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const submissions: HoleSubmission[] = (holeRows.data ?? []).map((row) => ({ ...(row.payload as HoleDraft), player: row.player_slug as string, hole: row.hole as number, submittedAt: row.submitted_at as string }));
  const submitted = (submittedRows.data ?? []).map((row) => row.player_slug as string);
  const status = liveRoundStatus(result.matchBox, playerSlug, HOLES, submissions);
  return {
    holesEntered: HOLES.filter((hole) => submittedPair(result.matchBox, playerSlug, hole.number, submissions).mine).length,
    roundCard: status.state,
    iSubmitted: submitted.includes(playerSlug),
    waitingOn: waitingOnSubmitters(result.matchBox, playerSlug, submitted).filter((slug) => slug !== playerSlug),
    courseName: (course.data as { name: string } | null)?.name ?? null,
  };
}
```

- [ ] **Step 2: Replace `components/portal/ScoringStatusScreen.tsx`**

```tsx
import Link from "next/link";
import { LoadingScreen } from "@/components/LoadingScreen";
import { matchupLabel, type CurrentRoundResult } from "@/lib/live/currentRoundForPlayer";
import { scoringSides } from "@/lib/live/holeSubmission";
import type { ScoringStage } from "@/lib/live/scoringStage";
import { getPlayerDisplayName } from "@/lib/data/players";
import { nextTournament } from "@/lib/data";

function formatTeeTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

const BUTTON_LABELS: Record<Exclude<ScoringStage, "none">, string> = {
  upcoming: "Begin Round",
  begin: "Begin Round",
  continue: "Continue Round",
  ready: "Continue Round",
  submitted: "View Scorecard",
};

/**
 * The Scoring landing screen for the player's current round: the full
 * matchup (who you play, who you are scoring for) and a Begin / Continue /
 * View button that opens live scoring. Progress is saved on the server hole
 * by hole, so leaving and coming back never loses anything.
 */
export function ScoringStatusScreen({
  playerName,
  playerSlug,
  result,
  stage,
  progress,
}: {
  playerName: string;
  playerSlug: string;
  result: CurrentRoundResult | null;
  stage: ScoringStage;
  progress: { holesEntered: number; waitingOn: string[]; courseName: string | null } | null;
}) {
  const topSlot = <>Welcome, {playerName}</>;

  if (!result || stage === "none") {
    return (
      <LoadingScreen heading={`Maroon Masters ${nextTournament.year}`} topSlot={topSlot}>
        <p className="font-sans text-lg text-cream-50/90">Waiting For Matchup</p>
      </LoadingScreen>
    );
  }

  const { matchBox, round } = result;
  const scoring = scoringSides(matchBox, playerSlug).opponents.map(getPlayerDisplayName).join(" & ");
  const waitingNames = (progress?.waitingOn ?? []).map(getPlayerDisplayName).join(" & ");
  const heading = stage === "upcoming" ? "Upcoming Round" : stage === "submitted" ? "Round Submitted" : "Round Live";
  const note =
    stage === "upcoming" ? "Waiting For Round To Begin"
    : stage === "continue" ? `Through ${progress?.holesEntered ?? 0} holes`
    : stage === "ready" ? "Your card matches — submit your round"
    : stage === "submitted" ? (waitingNames ? `Waiting on ${waitingNames}` : "Round complete")
    : null;
  const label = BUTTON_LABELS[stage];

  return (
    <LoadingScreen heading={heading} topSlot={topSlot} raised>
      <p className="font-sans text-base text-cream-50/80">Round {round.round} &middot; {matchBox.format}{progress?.courseName ? ` · ${progress.courseName}` : ""}</p>
      <p className="font-sans text-lg text-cream-50/90">{formatTeeTime(matchBox.teeTime)}</p>
      <p className="font-sans text-base text-cream-50/80">{matchupLabel(playerSlug, matchBox)}</p>
      {scoring && <p className="font-sans text-sm text-cream-50/80">You are scoring: {scoring}</p>}
      {stage === "upcoming" ? (
        <div className="mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2 border-cream-50/40">
          <span className="font-condensed text-sm font-bold uppercase tracking-wide text-cream-50">{label}</span>
        </div>
      ) : (
        <Link href="/portal/scoring/play" className="mt-4 flex h-16 w-40 items-center justify-center rounded-md border-2 border-cream-50 bg-cream-50">
          <span className="font-condensed text-sm font-bold uppercase tracking-wide text-maroon-700">{label}</span>
        </Link>
      )}
      {note && <p className="font-sans text-sm text-cream-50/80">{note}</p>}
    </LoadingScreen>
  );
}
```

- [ ] **Step 3: Update `app/portal/scoring/page.tsx`** — replace the imports/last lines so it reads (keep the auth block above `const result` exactly as is):

```tsx
import { findCurrentRoundForPlayer } from "@/lib/live/currentRoundForPlayer";
import { loadScoringProgress } from "@/lib/live/scoringProgress";
import { scoringStage } from "@/lib/live/scoringStage";
import { ScoringStatusScreen } from "@/components/portal/ScoringStatusScreen";
```
and after `const result = await findCurrentRoundForPlayer(playerSlug);` replace the `return` with:

```tsx
  const progress = result ? await loadScoringProgress(result, playerSlug) : null;
  const stage = scoringStage({
    hasMatch: !!result,
    matchState: result?.state ?? null,
    holesEntered: progress?.holesEntered ?? 0,
    roundCard: progress?.roundCard ?? "waiting",
    iSubmitted: progress?.iSubmitted ?? false,
  });

  return <ScoringStatusScreen playerName={playerName} playerSlug={playerSlug} result={result} stage={stage} progress={progress} />;
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` and `npx eslint app/portal/scoring components/portal/ScoringStatusScreen.tsx lib/live` — Expected: clean. (The screen and loader need login + a database, so they are verified by type-check, lint, build and the tested logic they call — say so in the final report.)

---

### Task 11: Tiger sees who has not submitted

**Files:**
- Modify: `app/api/live/matches/route.ts`, `components/portal/tiger/MatchCloseoutCards.tsx`

**Interfaces:**
- Produces: each entry from `GET /api/live/matches` gains `submittedPlayers: string[]`; the closeout card shows "Waiting on …" and gates Close Out Match, with a "Close out anyway" override.

- [ ] **Step 1: Patch the route** — run:

```bash
python - <<'EOF'
import io
p = "app/api/live/matches/route.ts"
s = io.open(p, encoding="utf-8", newline="").read()
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:90]
    s = s.replace(old, new)
rep("const [{ data: states }, { data: odds }] = await Promise.all([",
    "const [{ data: states }, { data: odds }, { data: submissions }] = await Promise.all([")
rep("    ids.length ? service.from(\"live_match_odds_snapshots\").select(\"*\").in(\"match_box_id\", ids).order(\"created_at\", { ascending: false }) : Promise.resolve({ data: [] }),\n  ]);",
    "    ids.length ? service.from(\"live_match_odds_snapshots\").select(\"*\").in(\"match_box_id\", ids).order(\"created_at\", { ascending: false }) : Promise.resolve({ data: [] }),\n    ids.length ? service.from(\"live_match_box_submissions\").select(\"match_box_id, player_slug\").in(\"match_box_id\", ids) : Promise.resolve({ data: [] }),\n  ]);\n  const submittedById = new Map<string, string[]>();\n  for (const row of submissions ?? []) submittedById.set(row.match_box_id as string, [...(submittedById.get(row.match_box_id as string) ?? []), row.player_slug as string]);")
rep("odds: oddsById.get(match.id as string) ?? null }))",
    "odds: oddsById.get(match.id as string) ?? null, submittedPlayers: submittedById.get(match.id as string) ?? [] }))")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
EOF
```

- [ ] **Step 2: Patch the card** — in `components/portal/tiger/MatchCloseoutCards.tsx`: add `import { getPlayerDisplayName } from "@/lib/data/players";`; extend `Entry` with `submittedPlayers: string[]`; and replace the `ready.map(...)` block with:

```tsx
{ready.map(({ match, officialState, submittedPlayers }) => {
  const waiting = [...match.maroon_players, ...match.white_players].filter((slug) => !submittedPlayers.includes(slug));
  return (
    <div key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white p-3">
      <div>
        <p className="font-sans text-sm font-semibold text-ink-900">Round {match.round}, Match {match.box_number}: {officialState?.leader === "tie" ? "Tied" : `${officialState?.leader} ${officialState?.margin} up`}</p>
        {waiting.length > 0 && <p className="font-sans text-xs text-ink-500">Waiting on {waiting.map(getPlayerDisplayName).join(", ")} to submit their round</p>}
      </div>
      <button type="button" disabled={busy === match.id || waiting.length > 0} onClick={() => closeMatch(match.id)} className="rounded bg-maroon-700 px-3 py-2 font-condensed text-2xs font-bold uppercase text-white disabled:bg-ink-200 disabled:text-ink-500">{busy === match.id ? "Closing…" : "Close Out Match"}</button>
      {waiting.length > 0 && <button type="button" disabled={busy === match.id} onClick={() => closeMatch(match.id)} className="font-condensed text-2xs font-bold uppercase text-maroon-700 underline">Close out anyway</button>}
    </div>
  );
})}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx eslint app/api/live components/portal/tiger/MatchCloseoutCards.tsx` — Expected: clean.

---

### Task 12: Browser tests for the live Scorecard

**Files:**
- Modify: `scripts/test-scoring-browser.mjs`

**Interfaces:**
- Consumes: `Scorecard` live mode (`data-round-state`, `Edit hole N` buttons with `bg-red-600` when disputed, pill labels `Submit Round` / `Submitted`, the dialog's `Tiger can correct it later` copy), `POST /api/portal/scoring/submit` (mocked).

- [ ] **Step 1: Patch the harness and replace the old competitor assertions** — run:

```bash
python - <<'EOF'
import io
p = "scripts/test-scoring-browser.mjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
s = s.replace("\r\n", "\n")
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:90]
    s = s.replace(old, new)

rep("let submissions=[];let fail=false;const requests=[];", "let submissions=[];let submittedPlayers=[];let fail=false;const requests=[];const submitRequests=[];")
rep("scores:[],submittedPlayers:[],holeSubmissions:submissions}}));", "scores:[],submittedPlayers,holeSubmissions:submissions}}));\n await page.route('**/api/portal/scoring/submit',async r=>{submitRequests.push(r.request().postDataJSON());submittedPlayers=['cade-barone'];return r.fulfill({json:{ok:true,submitted:true,official:false,waitingOn:['cam-latto']}});});")

start = s.index(" await page.setViewportSize({width:390,height:844});\n await page.getByRole('button',{name:'Scorecard',exact:true}).click();\n await page.getByText('Latto'")
end = s.index("console.log('PASS: live scoring Scorecard shows the competitor in a second grid, under a button outside the header');") + len("console.log('PASS: live scoring Scorecard shows the competitor in a second grid, under a button outside the header');")
new_block = """ await page.setViewportSize({width:390,height:844});
 const cardEntry=(player,hole,own,opp)=>({player,hole,ownScore:own,opponentScore:opp,putts:2,fairway:'hit',green:'hit',submittedAt:'2027-01-01T10:'+String(hole).padStart(2,'0')+':00Z'});
 const cardOf=(player,own,opp,upTo=18,changes={})=>Array.from({length:upTo},(_,i)=>({...cardEntry(player,i+1,own,opp),...(changes[i+1]??{})}));
 const openCard=async()=>{await page.reload();await page.getByRole('button',{name:'Scorecard',exact:true}).click();await page.getByRole('button',{name:'Edit hole 1',exact:true}).waitFor();};
 const roundState=()=>page.locator('[data-round-state]').getAttribute('data-round-state');
 // white: your scorer has only entered holes 1-9
 submissions=[...cardOf('cade-barone',4,5),...cardOf('cam-latto',5,4,9)];
 await openCard();
 assert.equal(await roundState(),'waiting');
 assert.equal(await page.getByRole('button',{name:'Submit Round',exact:true}).isDisabled(),true);
 await page.getByText('Waiting for Latto to enter hole 10',{exact:false}).waitFor();
 assert.equal(await page.getByText('Yardage',{exact:true}).count(),1,'only your own card is shown, no competitor grid');
 // red: hole 5 disagrees; that hole number turns red and your scorer's number is never shown
 submissions=[...cardOf('cade-barone',4,5),...cardOf('cam-latto',5,4,18,{5:{ownScore:19}})];
 await openCard();
 assert.equal(await roundState(),'disputed');
 assert.match(await page.getByRole('button',{name:'Edit hole 5',exact:true}).getAttribute('class'),/bg-red-600/);
 await page.getByText("Hole 5 doesn't match",{exact:false}).waitFor();
 assert.equal(await page.getByText('19',{exact:true}).count(),0,"the other scorer's numbers are never shown");
 assert.equal(await page.getByRole('button',{name:'Submit Round',exact:true}).isDisabled(),true);
 // green: everything matches, Submit Round is usable, asks first, then locks
 submissions=[...cardOf('cade-barone',4,5),...cardOf('cam-latto',5,4)];
 await openCard();
 assert.equal(await roundState(),'match');
 for(const total of ['72','90'])await page.getByText(total,{exact:true}).first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Submit Round',exact:true}).isDisabled(),false);
 await page.getByRole('button',{name:'Submit Round',exact:true}).click();
 const roundDialog=page.getByRole('dialog');
 await roundDialog.getByText('Tiger can correct it later',{exact:false}).waitFor();
 await page.keyboard.press('Escape');
 await roundDialog.waitFor({state:'detached'});
 assert.equal(submitRequests.length,0,'opening the confirmation submits nothing');
 await page.getByRole('button',{name:'Submit Round',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Submit Round',exact:true}).click();
 await page.getByRole('button',{name:'Submitted',exact:true}).waitFor();
 assert.deepEqual(submitRequests,[{round:1}]);
 await page.getByText('waiting on Latto',{exact:false}).waitFor();
 console.log('PASS: live Scorecard shows white / red / green round status, never the other scorer\\'s numbers, and Submit Round asks first then locks');"""
s = s[:start] + new_block + s[end:]
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
EOF
```

- [ ] **Step 2: Run**

Run: `npm run test:browser`
Expected: every earlier `PASS:` line plus `PASS: live Scorecard shows white / red / green round status…`. The handicap dialog assertions (`Submit Scores`, "After you submit scores…") must still pass.

---

### Task 13: Changelog, full verification, and hand-off notes

**Files:**
- Modify: `project_specs.md` (add a changelog entry before `## Known gaps / not yet built`; update the live-scoring gap entry to say Phase 1 is built once verified)

- [ ] **Step 1: Run every check**

Run, and record real output for each:
```bash
npx tsc --noEmit
npx eslint components/portal components/nav lib/live lib/handicap lib/portal app/portal app/api/live app/api/portal/scoring
npm test
npm run test:db
npm run test:browser
npm run build
```
Expected: all clean/passing. Any pre-existing unrelated lint failures elsewhere in the repo must be named, not hidden.

- [ ] **Step 2: Add the changelog entry** — a paragraph titled "**Live scoring Phase 1 — player lifecycle**" covering: Begin/Continue Round and the other Scoring-tab stages; the live Scorecard (own entries + a second score row of what you entered for your opponent, red/muted hole numbers, white/red/green round status, Submit Round pill, confirm dialog, competitor grid removed); explicit Submit Round (`submit_live_round`), no auto-submit, lock after submit; the `submitted` archive status and the handicap filter; the Scoring tab moving on once both submit; Tiger's closeout card showing who has not submitted; the new migration `supabase/live_round_submission.sql` that **must be run once in the Supabase SQL Editor** (after `live_hole_submissions.sql` and `scoring_reliability.sql`); and honest verification notes (what was tested, and that the Scoring tab screen, the loader, Tiger's card and the deployed round trip are covered only by type-check/lint/build and need a two-phone check).

- [ ] **Step 3: Plain-English SQL note for the user** — in the final report explain, one sentence each: (a) it stops the app from marking a round "submitted" by itself, (b) it locks a player's entries once they press Submit Round, (c) it adds the Submit Round check, (d) it marks the archive round official only when both scorers have submitted, (e) where to run it (Supabase → SQL Editor → paste the file → Run), and that the new buttons will not work live until it has been run.

---

## Self-Review (run against the spec)

- **§3.6 / 7.3 other scorer never shown, colors:** Tasks 1, 8, 9, 12 (`liveRoundStatus`, competitor grid removed, browser test asserts a leaked value is absent).
- **§7.1 Scoring tab stages, Begin/Continue, full matchup, "You are scoring", tab moves on when both submit:** Tasks 2, 3, 10.
- **§7.4 no auto-submit, explicit submit, lock, scorer edit never un-submits, official when the pair agrees, Foursome all four:** Task 4 (with DB tests for each).
- **§9.1/9.2 handicap and archive require `submitted`/`final`; stats and odds unchanged:** Task 5 (stats/odds code untouched).
- **§7.5 closeout card waits on submitters, Tiger override:** Task 11.
- **§13 Definition of done:** Task 13 verification.
- **Deferred to later phases (by design):** Tiger Edit Scores, wager reversal, public leaderboard/Sheet backup, the shared "3&2" wording (Phases 2–3).
- **Type consistency:** `RoundCardState`/`LiveScorecard.state` are the same three strings; `ScoringStage` labels match `BUTTON_LABELS`; `submit_live_round` returns `{submitted, official, waitingOn}` and the route spreads it; `ScorecardHoleRow.opponentScore` is optional so handicap rows are unchanged.

## Execution

The user asked for this plan to be written and then executed in this session, so execute **inline** with `superpowers:executing-plans` (no subagents), task by task, running each task's verification before moving on.
