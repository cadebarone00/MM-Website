import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import type { PlayerRound } from "@/lib/platform/playerRounds";
import { devTripId, scopedRoundId } from "./devPlayerRounds";

/** Imported own-ball cards, not the previous card repeated during shared-ball sessions. */
export function scorecardTripRounds(match: GolfMatchPreview, nameToId: (name: string) => string): PlayerRound[] {
  const tripId = devTripId(match);
  return (match.roundStandings ?? []).flatMap(snapshot => {
    if (snapshot.standingsRound !== undefined && snapshot.standingsRound !== snapshot.round) return [];
    return snapshot.leaderboard.flatMap(row => {
      const holes = row.holeDetails;
      if (!holes || holes.length !== 18 || holes.some((h, i) => h.strokes <= 0 || h.strokes !== row.holes[i])) return [];
      const profileId = nameToId(row.golfer.name), tripRoundId = scopedRoundId(tripId, snapshot.round);
      return [{ id: `trip:${tripId}:${tripRoundId}:${profileId}`, profileId, source: "trip", tripId, tripRoundId,
        datePlayed: snapshot.datePlayed ?? "", course: { ref: null, name: row.golfer.course, place: "" }, tee: null, holesPlayed: 18,
        format: snapshot.format ?? "Historical own-ball", holes, total: holes.reduce((sum, h) => sum + h.strokes, 0),
        countsForHandicap: false, notCountedReason: "Development archive input", differential: null,
        enteredBy: "organizer", status: "submitted" } satisfies PlayerRound];
    });
  });
}
