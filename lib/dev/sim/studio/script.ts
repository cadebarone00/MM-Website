import type { DriverAction, Target } from "../driver/types";
import type { SampleCourse } from "./courses";
import { strokesFor, type StudioSetup } from "./setup";

/** A driver action, or `tapIf`: tap the target only when it's on screen (checked with a short waitFor; the runner does it). */
export type SimAction = DriverAction | { kind: "tapIf"; target: Target };

/**
 * One thing a person does on one phone. `expect` is the screen the step starts from (checked with a 2 s waitFor before
 * anything is tapped); `name` and `screen` only make the runner's messages plain ("Jake's phone isn't on the Play home
 * screen"). `atomic`: the actions are relative (+1 stroke taps), so a step interrupted partway must never be resumed or
 * re-run on its own; the owner fixes the phone by hand and presses Skip.
 */
export type SimStep = { id: string; phone: string; say: string; expect?: Target; actions: SimAction[]; name?: string; screen?: string; atomic?: boolean };

const tap = (target: Target): SimAction => ({ kind: "tap", target });
const type = (target: Target, text: string): SimAction => ({ kind: "type", target, text });
const waitFor = (target: Target, timeoutMs?: number): SimAction => ({ kind: "waitFor", target, ...(timeoutMs ? { timeoutMs } : {}) });
/** The scoring screens' first name: "Uncle Rob" → "Uncle" (PlayRound's firstName). */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// The real screens' labels (read from the components; see the task report for where each comes from).
const HOME_SEARCH = { text: "Search for a course" };
const COURSE_SEARCH = { label: "Search golf courses for your round" };
const INVITE_SEARCH = { label: "Invite a player" };
const GUEST_NAME = { label: "Guest's name" };
const NEXT = { text: "Next" };
const START = { text: "Start round" };
const holeNumber = (hole: number): Target => ({ sim: "hole-number", text: `Hole ${hole}` });

/** A course search result reads "<name> <place> · Par <total>" (CourseSearchBar). */
const resultText = (course: SampleCourse) => `${course.name} ${course.place} · Par ${course.par.reduce((a, b) => a + b, 0)}`;
/** A tee in the Tees dropdown reads "Blue · 70.4 / 124" or "Blue · no rating" (PlayRound SetupStep). */
const teeText = (tee: SampleCourse["tees"][number]) => `${tee.name}${tee.rating != null && tee.slope != null ? ` · ${tee.rating} / ${tee.slope}` : " · no rating"}`;

/**
 * The steps a group of people take on the real Play screens to play `setup` at `course`:
 * the host starts the round from Home (course search → tees → Track stats off → invite each player by name, add the guest
 * → the game → Start round), every invitee goes Home and taps Join on the invite card, the host keeps score for everyone
 * hole by hole with the +/− steppers (each box starts at par), then opens the Card and submits.
 */
export function playScript(setup: StudioSetup, course: SampleCourse): SimStep[] {
  const host = setup.players.find((p) => p.key === setup.host);
  if (!host) throw new Error("The host must be one of the players.");
  const hostName = host.name.trim();
  const invitees = setup.players.filter((p) => p.key !== setup.host).map((p) => ({ key: p.key, name: p.name.trim() }));
  const strokes = strokesFor(setup, course);
  const teeIndex = Math.max(0, course.tees.findIndex((t) => t.name === setup.tee));
  const hostStep = (id: string, say: string, screen: string, expect: Target | undefined, actions: SimAction[], atomic = false): SimStep =>
    ({ id, phone: host.key, name: hostName, say, screen, ...(expect ? { expect } : {}), actions, ...(atomic ? { atomic } : {}) });
  const steps: SimStep[] = [];

  // 1. Your round: Home → Search for a course → the result → tees → Track stats off (strokes only) → Next.
  const pickTee: SimAction[] = teeIndex === 0 ? [waitFor({ text: teeText(course.tees[0]) })]
    : [tap({ text: teeText(course.tees[0]) }), tap({ text: teeText(course.tees[teeIndex]) }), waitFor({ text: teeText(course.tees[teeIndex]) })];
  steps.push(hostStep("round", `${hostName} starts a round at ${course.name}`, "the Play home screen", HOME_SEARCH, [
    tap(HOME_SEARCH),
    type(COURSE_SEARCH, course.name),
    tap({ text: resultText(course) }),
    ...pickTee,
    // Track stats off (data-sim "track-stats-on" / "-off" says its state): tapped only while it's on, then confirmed off.
    { kind: "tapIf", target: { sim: "track-stats-on" } },
    waitFor({ sim: "track-stats-off" }),
    tap(NEXT),
    waitFor(INVITE_SEARCH),
  ]));

  // 2. Who's playing: each player by name (the search result reads "<name> @<username> Invite"), then the guest.
  for (const p of invitees) {
    steps.push(hostStep(`invite-${p.key}`, `${hostName} invites ${p.name}`, "the Who's playing page", INVITE_SEARCH, [
      type(INVITE_SEARCH, p.name),
      tap({ text: `${p.name} @${p.key} Invite` }),
      waitFor({ label: `Don't invite ${p.name}` }),
    ]));
  }
  if (setup.guest) {
    const guest = setup.guest.trim();
    steps.push(hostStep("guest", `${hostName} adds ${guest} as a guest`, "the Who's playing page", INVITE_SEARCH, [
      type(GUEST_NAME, guest),
      tap({ text: "Add guest" }),
      waitFor({ label: `Remove ${guest}` }),
    ]));
  }

  // 3. The game, then 4. review → Start round. The scoring sheet opens on hole 1.
  steps.push(hostStep("game", setup.game === "skins" ? `${hostName} picks Skins` : `${hostName} plays without a game`, "the Who's playing page", INVITE_SEARCH, [
    tap(NEXT),
    ...(setup.game === "skins" ? [tap({ text: "Choose a game Optional" }), tap({ sim: "game-skins" }), waitFor({ label: "No game" })] : [waitFor({ text: "Choose a game Optional" })]),
    tap(NEXT),
    waitFor(START),
  ]));
  steps.push(hostStep("start", `${hostName} starts the round`, "the Ready to tee off page", START, [
    tap(START),
    waitFor(holeNumber(1), 15000),
  ]));

  // Each invitee: Home → the invite card's Join (the join-code box on Home has a Join button too) → the round opens.
  for (const p of invitees) {
    steps.push({ id: `accept-${p.key}`, phone: p.key, name: p.name, say: `${p.name} accepts the invite`, actions: [
      { kind: "go", path: "/" },
      waitFor({ text: "Join", within: { label: "Round invites" } }, 15000),
      tap({ text: "Join", within: { label: "Round invites" } }),
      waitFor({ label: "Round settings" }, 15000),
    ] });
  }

  // Scoring: the host enters everyone's strokes on each hole. Boxes start at par; + / − move one stroke.
  const people = [
    { key: host.key, name: hostName, label: "My Score" },
    ...invitees.map((p) => ({ key: p.key, name: p.name, label: firstName(p.name) })),
    ...(setup.guest ? [{ key: "guest", name: setup.guest.trim(), label: firstName(setup.guest) }] : []),
  ];
  for (let h = 0; h < 18; h++) {
    const actions: SimAction[] = [];
    for (const person of people) {
      const delta = strokes[person.key][h] - course.par[h];
      const label = `${delta > 0 ? "One more" : "One less"} stroke for ${person.label}`;
      for (let i = 0; i < Math.abs(delta); i++) actions.push(tap({ label }));
    }
    actions.push(tap(h === 17 ? { text: "Scorecard" } : { text: "Next hole" }));
    actions.push(h === 17 ? waitFor({ text: "Submit & Save" }) : waitFor(holeNumber(h + 2)));
    steps.push(hostStep(`hole-${h + 1}`, `Hole ${h + 1}: ${people.map((p) => `${p.name} ${strokes[p.key][h]}`).join(", ")}`, `hole ${h + 1}`, holeNumber(h + 1), actions, true));
  }

  // The Card: Submit & Save → Are you sure? → Submit Score → saved.
  steps.push(hostStep("submit", `${hostName} submits the round`, "the Card", { text: "Submit & Save" }, [
    tap({ text: "Submit & Save" }),
    tap({ text: "Submit Score" }),
    waitFor({ text: "See my rounds" }, 15000),
  ]));
  return steps;
}
