import type { ComponentProps } from "react";
import type { GolfTripHome } from "@/components/platform/GolfTripHome";
import type { GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { GOLF_MATCH_PREVIEW, GOLF_MATCH_PREVIEWS, GOLF_TRIP_MOCK_DRAFT, normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { flightSummary } from "@/lib/platform/golfTripFlights";
import type { SimulatorConfig } from "./simulator";

export type SimulatorTripData = Pick<ComponentProps<typeof GolfTripHome>, "preview" | "previewMatch" | "flights">;

/** Deterministic fictional crowd, derived from the existing generic format fixture. */
function populatedMatch(sample: GolfMatchPreview, count: number): GolfMatchPreview {
  const leaderboard = Array.from({ length: count }, (_, index) => {
    const row = sample.leaderboard[index % sample.leaderboard.length];
    return { ...row, position: String(index + 1), golfer: { ...row.golfer, name: `Guest Golfer ${index + 1}` }, holes: [...row.holes] };
  });
  const matches = Array.from({ length: Math.ceil(count / 2) }, (_, index) => ({
    left: leaderboard[index * 2].golfer, right: leaderboard[index * 2 + 1]?.golfer,
    gross: sample.matches[index % sample.matches.length]?.gross ?? null,
    net: sample.matches[index % sample.matches.length]?.net ?? null,
  }));
  return { ...sample, roundCount: 8, leaderboard, matches };
}

const toParLabel = (value: number) => value === 0 ? "E" : value > 0 ? `+${value}` : String(value);

/** Small seeded random generator (mulberry32): the same seed gives the same numbers, so server and browser agree. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mock trips only: a varied field. Each golfer gets a skill (great → rough), a separate "form today" (so some are under
 * par today but over for the tournament, and the other way round), and a score from earlier rounds. One hole's strokes
 * over par come from a spread that leans with skill + form: birdies and the odd eagle for good play, doubles and worse
 * for bad. Seeded by golfer and round state, so each state has its own mix that stays the same on every load.
 */
function mixedRound(index: number, roundState: string, par: number[], holesPlayed: number, roundsBefore: number) {
  const random = seededRandom((index + 1) * 7919 + roundState.length * 104729 + roundState.charCodeAt(0) * 31);
  // Skill ≈ strokes over par per hole: -0.16 / -0.1 / -0.04 / 0.02 / 0.08 / 0.14 ≈ -2 / +1 / +5 / +9 / +14 / +18 a round.
  // Built-in contrast: every 4th golfer is a weaker player on a hot day (under today, over for the tournament), the next a
  // strong player on a cold day (over today, under overall); everyone else has normal ups and downs (about ±3 strokes).
  const pick = (options: number[]) => options[Math.floor(random() * options.length)];
  const story = index % 4;
  const skill = story === 0 ? pick([0.02, 0.08]) : story === 1 ? pick([-0.16, -0.1]) : pick([-0.16, -0.1, -0.04, 0.02, 0.08, 0.14]);
  const form = story === 0 ? -0.2 - random() * 0.04 : story === 1 ? 0.16 + random() * 0.04 : (random() - 0.5) * 0.08;
  const holeScore = (holePar: number, lean: number) => {
    const roll = random() + lean;
    const overPar = roll < 0.01 && holePar >= 5 ? -2 : roll < 0.15 ? -1 : roll < 0.6 ? 0 : roll < 0.85 ? 1 : roll < 0.96 ? 2 : 3;
    return Math.max(1, holePar + overPar);
  };
  const holes = Array.from({ length: 18 }, (_, hole) => hole >= holesPlayed ? null : holeScore(par[hole] ?? 4, skill + form));
  let before = 0;
  for (let round = 0; round < roundsBefore; round++) for (let hole = 0; hole < 18; hole++) before += holeScore(par[hole] ?? 4, skill) - (par[hole] ?? 4);
  return { holes, before };
}

/**
 * Round-state simulator conditions. Every state builds the same sample each time, from whatever the source has (the mock
 * is mid-round, the Maroon data is a finished event without hole-by-hole scores), filling missing holes with par-based
 * scores. scheduled: round 1, nothing played. live: holes 1–9 played. between: round 3 finished, round 4 next.
 * complete: the last round finished.
 */
function withRoundState(match: GolfMatchPreview, roundState: Exclude<SimulatorConfig["state"]["roundStatus"], "source">, mixed = false): GolfMatchPreview {
  const resetGolfer = (golfer: ReturnType<typeof normalizeCompetitor>["golfers"][number]) => ({ ...golfer, thru: "—", score: "—", points: 0 });
  if (roundState === "scheduled") {
    return { ...match, round: 1,
      matches: match.matches.map(pairing => ({ ...pairing, gross: null, net: null,
        left: { ...normalizeCompetitor(pairing.left), golfers: normalizeCompetitor(pairing.left).golfers.map(resetGolfer) },
        right: pairing.right ? { ...normalizeCompetitor(pairing.right), golfers: normalizeCompetitor(pairing.right).golfers.map(resetGolfer) } : undefined,
      })),
      leaderboard: match.leaderboard.map(row => ({ ...row, golfer: resetGolfer(row.golfer), total: "—", netTotal: "—", today: "—", netToday: "—", thru: "—", holes: Array(18).fill(null) })),
    };
  }
  const holesPlayed = roundState === "live" ? 9 : 18;
  const roundCount = roundState === "between" ? Math.max(4, match.roundCount) : match.roundCount;
  const round = roundState === "between" ? 3 : roundState === "complete" ? roundCount : Math.min(match.round, roundCount);
  const thru = holesPlayed === 18 ? "F" : String(holesPlayed);
  const par = match.par;
  // Rounds already finished before today's: live plays the current round, between has finished round 3, complete the last.
  const roundsBefore = round - 1;
  let leaderboard = match.leaderboard.map((row, index) => {
    // Mock trips get a varied field (mixedRound). Otherwise played holes keep the source's score, or get par give or take
    // one (same every time, different per golfer), and the round is the whole tournament so far.
    const generated = mixed ? mixedRound(index, roundState, par, holesPlayed, roundsBefore) : null;
    const holes = generated ? generated.holes : Array.from({ length: 18 }, (_, hole) => hole >= holesPlayed ? null
      : row.holes[hole] ?? (par[hole] ?? 4) + ((index + hole) % 5 === 0 ? 1 : (index * 3 + hole) % 7 === 0 ? -1 : 0));
    const today = holes.reduce<number>((sum, strokes, hole) => sum + (strokes === null ? 0 : strokes - (par[hole] ?? 4)), 0);
    const total = today + (generated?.before ?? 0);
    const hcp = row.golfer.hcp ?? 0;
    const label = toParLabel(total);
    return { ...row, holes, thru, today: toParLabel(today), total: label,
      netToday: toParLabel(today - Math.round(hcp * holesPlayed / 18)),
      netTotal: toParLabel(total - Math.round(hcp * ((generated ? roundsBefore : 0) + holesPlayed / 18))),
      golfer: { ...row.golfer, thru: thru === "F" ? "F" : `Thru ${thru}`, score: label } };
  });
  // Mock trips: order by total (lowest first) and number the positions, with ties shown as T2, T2, …
  if (mixed) {
    const value = (label: string) => label === "E" ? 0 : Number(label);
    leaderboard = [...leaderboard].sort((a, b) => value(a.total) - value(b.total));
    leaderboard = leaderboard.map((row, index, rows) => {
      const first = rows.findIndex(other => other.total === row.total);
      const tied = rows.filter(other => other.total === row.total).length > 1;
      return { ...row, position: `${tied ? "T" : ""}${first + 1}` };
    });
  }
  const golferThru = (golfer: ReturnType<typeof normalizeCompetitor>["golfers"][number]) => ({ ...golfer, thru: thru === "F" ? "F" : `Thru ${thru}` });
  return { ...match, round, roundCount, leaderboard,
    matches: match.matches.map(pairing => ({ ...pairing,
      left: { ...normalizeCompetitor(pairing.left), golfers: normalizeCompetitor(pairing.left).golfers.map(golferThru) },
      right: pairing.right ? { ...normalizeCompetitor(pairing.right), golfers: normalizeCompetitor(pairing.right).golfers.map(golferThru) } : undefined,
    })),
  };
}

/** Pure presentation overrides; never edit the imported tournament or fixture objects. */
export function simulatorTripData(mock: SimulatorTripData, maroon: SimulatorTripData, config: SimulatorConfig): SimulatorTripData {
  const { source, state } = config;
  let base = source === "maroon" ? maroon : mock;
  if (source === "empty") {
    const side = { name: "Team unassigned", winPct: 0, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" };
    base = { preview: {}, previewMatch: { ...(mock.previewMatch ?? GOLF_MATCH_PREVIEW), course: "Course TBD", matches: [], leaderboard: [], round: 1, roundCount: 1, sides: [{ ...side }, { ...side }] }, flights: { summary: flightSummary([], "2027-04-01"), href: null } };
  }
  if (source === "busy") {
    const preview: GolfTripDraft = { ...GOLF_TRIP_MOCK_DRAFT, tripName: "Summer Golf Festival", destination: "Pinehurst, North Carolina", destinationLatitude: "35.1954", destinationLongitude: "-79.4695", playerCount: "32", golfDays: "4" };
    for (let day = 1; day <= 4; day++) {
      preview[`day${day}Date`] = `2027-04-${21 + day}`;
      preview[`day${day}Rounds`] = "2";
      preview[`round${day * 2 - 1}Course`] = `Festival Course ${day} · Morning`;
      preview[`round${day * 2}Course`] = `Festival Course ${day} · Afternoon`;
    }
    base = { ...mock, preview, previewMatch: populatedMatch(mock.previewMatch ?? GOLF_MATCH_PREVIEW, state.playerCount ?? 32) };
  }
  const preview = { ...base.preview };
  if (state.competition !== "source") preview.includesTournament = state.competition;
  if (state.playerCount !== null) preview.playerCount = String(state.playerCount);
  let previewMatch = base.previewMatch;
  if (previewMatch && state.format !== "source" && GOLF_MATCH_PREVIEWS[state.format]) {
    const format = GOLF_MATCH_PREVIEWS[state.format];
    // Keep the real roster/matches; change only the format presentation metadata.
    previewMatch = { ...previewMatch, format: format.format, formatDef: format.formatDef };
  }
  if (previewMatch && state.roundStatus !== "source") previewMatch = withRoundState(previewMatch, state.roundStatus, source !== "maroon");
  return { ...base, preview, previewMatch };
}
