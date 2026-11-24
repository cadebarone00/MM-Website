import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_COURSES } from "./courses";
import { PRESETS, strokesFor, type StudioSetup } from "./setup";
import { playScript, type SimAction } from "./script";

const preset = (id: string): StudioSetup => structuredClone(PRESETS.find((p) => p.id === id)!.setup);
const courseOf = (s: StudioSetup) => SAMPLE_COURSES.find((c) => c.ref === s.course)!;
const holeSteps = (steps: ReturnType<typeof playScript>) => steps.filter((s) => s.id.startsWith("hole-"));

/** Net strokes a hole step enters for a stepper label: taps on "One more" minus taps on "One less". */
function entered(actions: SimAction[], label: string): number {
  let n = 0;
  for (const a of actions) {
    if (a.kind !== "tap" || !a.target.label) continue;
    if (a.target.label === `One more stroke for ${label}`) n++;
    if (a.target.label === `One less stroke for ${label}`) n--;
  }
  return n;
}

test("four-ball script: host start, 3 invite accepts, 18 hole steps, submit", () => {
  const setup = preset("play-fourball");
  const steps = playScript(setup, courseOf(setup));
  // round page, 3 invites, game page, start · 3 accepts · 18 holes · submit
  assert.equal(steps.length, 1 + 3 + 1 + 1 + 3 + 18 + 1);
  assert.deepEqual(steps.map((s) => s.phone), [
    "cam", "cam", "cam", "cam", "cam", "cam",
    "cade", "jake", "rob",
    ...Array.from({ length: 18 }, () => "cam"),
    "cam",
  ]);
  assert.equal(holeSteps(steps).length, 18);
  assert.equal(steps.at(-1)!.id, "submit");
  // Every invitee goes Home and taps Join on the invite card (not the join-code Join).
  for (const accept of steps.filter((s) => s.id.startsWith("accept-"))) {
    assert.deepEqual(accept.actions[0], { kind: "go", path: "/" });
    assert.ok(accept.actions.some((a) => a.kind === "tap" && a.target.text === "Join" && a.target.within?.label === "Round invites"));
  }
  // Skins is picked on the game page.
  assert.ok(steps.some((s) => s.actions.some((a) => a.kind === "tap" && a.target.sim === "game-skins")));
  // Track stats ends up off whatever its default: tapped only while on, then confirmed off.
  const round = steps[0].actions;
  const tapIf = round.findIndex((a) => a.kind === "tapIf" && a.target.sim === "track-stats-on");
  assert.ok(tapIf > 0);
  assert.deepEqual(round[tapIf + 1], { kind: "waitFor", target: { sim: "track-stats-off" } });
  assert.ok(steps.filter((s) => !s.id.startsWith("hole-")).every((s) => !s.atomic));
  // Step ids are unique (the runner's done list uses them).
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
});

test("hole steps type the seeded strokes", () => {
  // The real input is the +/− stepper (the box starts at par), so "typing" a score is (strokes − par) taps.
  const setup = { ...preset("play-friends") };
  const course = courseOf(setup);
  const strokes = strokesFor(setup, course);
  const holes = holeSteps(playScript(setup, course));
  holes.forEach((step, h) => {
    assert.equal(entered(step.actions, "My Score"), strokes.cam[h] - course.par[h], `host hole ${h + 1}`);
    assert.equal(entered(step.actions, "Cade"), strokes.cade[h] - course.par[h], `Cade hole ${h + 1}`);
    assert.equal(entered(step.actions, "Jake"), strokes.jake[h] - course.par[h], `Jake hole ${h + 1}`);
    assert.equal(entered(step.actions, "Uncle"), strokes.guest[h] - course.par[h], `guest hole ${h + 1}`);
    // The hole moves on (the last hole opens the Card).
    const last = step.actions.filter((a) => a.kind === "tap").at(-1)!;
    assert.equal(last.kind === "tap" && last.target.text, h === 17 ? "Scorecard" : "Next hole");
    // …and waits for the next hole (or the Card's Submit & Save) before the step counts as done.
    const after = step.actions.at(-1)!;
    assert.deepEqual(after.kind === "waitFor" && after.target, h === 17 ? { text: "Submit & Save" } : { sim: "hole-number", text: `Hole ${h + 2}` });
    assert.equal(step.expect?.sim, "hole-number");
    assert.equal(step.atomic, true, "relative +/- taps: never resumed or re-run on their own");
    assert.equal(step.expect?.text, `Hole ${h + 1}`);
  });
  // The say line carries the same numbers.
  assert.equal(holes[6].say, `Hole 7: Cam ${strokes.cam[6]}, Cade ${strokes.cade[6]}, Jake ${strokes.jake[6]}, Uncle Rob ${strokes.guest[6]}`);
});

test("solo has no invite steps; guest is added on the players page", () => {
  const solo = preset("play-solo");
  const plain = playScript(solo, courseOf(solo));
  assert.equal(plain.filter((s) => s.id.startsWith("invite-") || s.id.startsWith("accept-")).length, 0);
  assert.ok(plain.every((s) => s.phone === "cam"));
  assert.equal(plain.length, 1 + 1 + 1 + 18 + 1);
  // A solo hole only uses the host's own stepper.
  for (const step of holeSteps(plain)) {
    for (const a of step.actions) if (a.kind === "tap" && a.target.label) assert.match(a.target.label, /My Score$/);
  }

  const withGuest = { ...solo, guest: "Uncle Rob" };
  const steps = playScript(withGuest, courseOf(withGuest));
  const guest = steps.find((s) => s.id === "guest")!;
  assert.ok(guest, "a guest step");
  assert.equal(guest.expect?.label, "Invite a player"); // the players page
  assert.ok(guest.actions.some((a) => a.kind === "type" && a.target.label === "Guest's name" && a.text === "Uncle Rob"));
  assert.ok(guest.actions.some((a) => a.kind === "tap" && a.target.text === "Add guest"));
  assert.ok(steps.indexOf(guest) < steps.findIndex((s) => s.id === "game"));
});

test("every say is plain English with names, no ids", () => {
  for (const p of PRESETS) {
    const setup = structuredClone(p.setup);
    const course = courseOf(setup);
    const steps = playScript(setup, course);
    const names = setup.players.map((x) => x.name);
    for (const step of steps) {
      assert.ok(step.say.trim().length > 0);
      assert.doesNotMatch(step.say, /sim:|[0-9a-f]{8}-[0-9a-f]{4}|_|\bundefined\b|\bnull\b|\[object/, step.say);
      // Each line is about someone by name.
      assert.ok(names.some((n) => step.say.includes(n)), step.say);
      // No lowercase keys standing in for names ("cam starts…").
      for (const pl of setup.players) if (pl.key !== pl.name) assert.doesNotMatch(step.say, new RegExp(`\\b${pl.key}\\b`), step.say);
    }
    assert.equal(steps[0].say, `Cam starts a round at ${course.name}`);
    assert.equal(steps.at(-1)!.say, "Cam submits the round");
  }
  const four = preset("play-fourball");
  const steps = playScript(four, courseOf(four));
  assert.ok(steps.some((s) => s.say === "Jake accepts the invite"));
});
