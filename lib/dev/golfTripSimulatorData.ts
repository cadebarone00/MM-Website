import type { ComponentProps } from "react";
import type { GolfTripHome } from "@/components/platform/GolfTripHome";
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

/** Pure presentation overrides; never edit the imported tournament or fixture objects. */
export function simulatorTripData(mock: SimulatorTripData, maroon: SimulatorTripData, config: SimulatorConfig): SimulatorTripData {
  const { source, state } = config;
  let base = source === "maroon" ? maroon : mock;
  if (source === "empty") {
    base = { preview: {}, previewMatch: { ...(mock.previewMatch ?? GOLF_MATCH_PREVIEW), course: "Course TBD", matches: [], leaderboard: [], roundCount: 0 }, flights: { summary: flightSummary([], "2027-04-01"), href: null } };
  }
  if (source === "busy") {
    const preview = { ...GOLF_TRIP_MOCK_DRAFT, tripName: "Summer Golf Festival", destination: "Pinehurst, North Carolina", playerCount: "32", golfDays: "4" };
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
  if (previewMatch && state.roundStatus === "scheduled") {
    const resetGolfer = (golfer: ReturnType<typeof normalizeCompetitor>["golfers"][number]) => ({ ...golfer, thru: "—", score: "—", points: 0 });
    previewMatch = { ...previewMatch,
      matches: previewMatch.matches.map(match => ({ ...match, gross: null, net: null,
        left: { ...normalizeCompetitor(match.left), golfers: normalizeCompetitor(match.left).golfers.map(resetGolfer) },
        right: match.right ? { ...normalizeCompetitor(match.right), golfers: normalizeCompetitor(match.right).golfers.map(resetGolfer) } : undefined,
      })),
      leaderboard: previewMatch.leaderboard.map(row => ({ ...row, golfer: resetGolfer(row.golfer), total: "—", netTotal: "—", today: "—", netToday: "—", thru: "—", holes: Array(18).fill(null) })),
    };
  }
  return { ...base, preview, previewMatch };
}
