import React from "react";
import nodeModule from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { sheetCardFromScoring } from "./liveCards.ts";
import { applyResults, enqueue, queueStatus, type QueuedOp } from "./scoringQueue.ts";
import { changedEntries, mergeSent, type HoleEntryInput } from "./tripScoring.ts";
import { classifyHole } from "../golf/holeResult.ts";

// H5C Part 2 — saved Golf Trips: par is reference information, never an automatically entered score (owner 2026-10-21).
// The scoring screen as rendered, and the path a card takes to the offline queue.

// Test only: the scoring screen imports CSS modules, which Node can't load. Each class name becomes its own name.
// (Node 24 has registerHooks; the installed @types/node doesn't list it yet.)
type Load = (url: string, context: unknown, next: (url: string, context: unknown) => unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { load: Load }) => void };
registerHooks({ load: (url, context, next) => url.endsWith(".css")
  ? { format: "commonjs", source: "const css = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key === 'default' ? css : String(key) }); module.exports = css;", shortCircuit: true }
  : next(url, context) });
type ScoringProps = React.ComponentProps<typeof import("@/components/platform/GolfTripScoring").GolfTripScoring>;

const PAR = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const blank = <T,>(v: T) => Array.from({ length: 18 }, () => v);
const screen = async (props: Partial<ScoringProps>) => {
  const { GolfTripScoring } = await import("@/components/platform/GolfTripScoring"); // after the CSS hook above
  return renderToStaticMarkup(<GolfTripScoring startOpen courseName="Test Links" attesteeName="Jake" {...props} />);
};
const scoreBoxes = (html: string) => [...html.matchAll(/class="[^"]*strokes[^"]*"[^>]*aria-live="polite"><span( class="[^"]*")?>([^<]*)<\/span>/g)].map((m) => m[2]);

test("the saved-trip scoring screen shows the hole's par but an untouched score box stays empty", async () => {
  const holes = [5, ...blank(null).slice(1)];
  const saved = await screen({ par: PAR, parIsReference: true, initialHoles: holes });
  assert.match(saved, /Par 5/, "hole 2 (the first untouched hole) shows its par for reference");
  assert.deepEqual(scoreBoxes(saved), ["—", "—"], "my box and my attest box: empty, not 5");
  // The dev preview / Play a round keep their look: an untouched box shows par.
  assert.deepEqual(scoreBoxes(await screen({ par: PAR, initialHoles: holes })), ["5", "5"]);
  // No pars confirmed: exactly as saved trips looked before H5C.
  const none = await screen({ par: [], parIsReference: true, initialHoles: holes });
  assert.match(none, /Par —/);
  assert.deepEqual(scoreBoxes(none), ["—", "—"]);
});

test("offline: only holes the golfer entered are queued — pars never become queued scores", () => {
  const holes = [5, 4, null, 4, ...blank(null).slice(4)]; // three holes played, 15 untouched
  const sheet = sheetCardFromScoring({ holes, par: PAR, parIsReference: true, putts: holes.map((h) => (h === null ? null : 2)), fairways: blank(null), greens: blank(null),
    penalties: blank({ fairway: false, green: false }), attestStrokes: blank(null) });
  const toQueue = sheet.strokes.map((h, i) => (sheet.entered?.[i] === false ? null : h)); // SavedGolfTripHome's onScoringCardChange
  const changes = changedEntries({ holes: toQueue, putts: sheet.putts, fairways: sheet.fairways, greens: sheet.greens, penalties: sheet.penalties }, true, []);
  assert.deepEqual(changes.map((c) => c.hole), [1, 2, 4]);
  let n = 0;
  const scope = { profileId: "me", tripId: "t1", roundNumber: 1, groupId: "g1", scoredProfileId: "me", kind: "own" as const };
  let ops: QueuedOp[] = [];
  for (const entry of changes) ops = enqueue(ops, { ...scope, entry }, 0, () => `op${++n}`, "2027-04-11T15:00:00.000Z");
  assert.deepEqual(ops.map((o) => [o.entry.hole, o.entry.strokes]), [[1, 5], [2, 4], [4, 4]]);
  assert.equal(queueStatus(ops), "pending");
  // Back online: applied ops leave the queue; a version conflict keeps mine and records the server's, unchanged.
  ops = applyResults(ops, [{ opId: ops[0].opId, status: "applied", version: 1 }, { opId: ops[1].opId, status: "applied", version: 1 },
    { opId: ops[2].opId, status: "conflict", version: 2, server: { hole: 4, strokes: 5 } }]);
  assert.deepEqual(ops.map((o) => [o.entry.hole, o.status]), [[4, "conflict"]]);
  assert.equal(queueStatus(ops), "conflict");
});

test("a corrected score is queued as a change to that hole only; untouched holes are still never sent", () => {
  const sent: HoleEntryInput[] = mergeSent([], [1, 2, 3].map((hole) => ({ hole, strokes: PAR[hole - 1], putts: 2, fairway: null, green: null, penaltyFairway: false, penaltyGreen: false })));
  const holes = [PAR[0], PAR[1] - 1, PAR[2], ...blank(null).slice(3)]; // hole 2 corrected from par to a birdie
  const sheet = sheetCardFromScoring({ holes, par: PAR, parIsReference: true, putts: holes.map((h) => (h === null ? null : 2)), fairways: blank(null), greens: blank(null),
    penalties: blank({ fairway: false, green: false }), attestStrokes: blank(null) });
  const changes = changedEntries({ holes: sheet.strokes, putts: sheet.putts, fairways: sheet.fairways, greens: sheet.greens, penalties: sheet.penalties }, true, sent);
  assert.deepEqual(changes.map((c) => [c.hole, c.strokes]), [[2, 4]]);
  // Classified by the shared classifier against the confirmed par (the scorecard circle, Highlights' birdie).
  assert.deepEqual(classifyHole(4, PAR[1]).result, "birdie");
  assert.deepEqual(classifyHole(4, PAR[1]).shape, { outline: "circle", rings: 1 });
});
