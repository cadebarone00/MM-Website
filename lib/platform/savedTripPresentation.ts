import type { SavedGolfTrip } from "./golfTripCreate";
import type { GolfMatchPreview } from "./golfTripPreviewFixture";
import type { TripRoundScoring } from "./tripScoring";

/** Presentation adapter for real saved trips. Never borrows sample players, matches, handicaps or pars. */
export function savedTripPresentation(trip: SavedGolfTrip, scoring?: TripRoundScoring | null, today = new Date().toISOString().slice(0, 10)): GolfMatchPreview {
  const round = trip.rounds.find(item => item.roundNumber === scoring?.roundNumber)
    ?? trip.rounds.find(item => item.playDate && item.playDate >= today) ?? trip.rounds.at(-1);
  const course = round?.courseName || "Course TBD";
  const accepted = trip.members.filter(member => member.invitationStatus === "accepted" && member.profileId);
  const side = (name: string) => ({ name, winPct: 50, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" });
  return {
    round: round?.roundNumber ?? 1, roundCount: trip.rounds.length,
    roundDate: round?.playDate ?? trip.trip.start_date, course,
    format: "Stroke Play", handicap: false, scoring: "Gross", par: [],
    sides: [side("Team A"), side("Team B")], matches: [],
    leaderboard: accepted.map(member => {
      const holes = Array.from({ length: 18 }, (_, index) => scoring?.entries.find(entry => entry.scoredProfileId === member.profileId && entry.enteredByProfileId === member.profileId && entry.hole === index + 1)?.strokes ?? null);
      const completed = holes.filter(value => value !== null).length;
      const thru = completed === 18 ? "F" : completed ? `Thru ${completed}` : "";
      return { position: "—", golfer: { name: member.displayName, hcp: 0, thru, score: "—", teeTime: "", course, avatarUrl: member.avatarUrl ?? null, username: member.username ?? null },
        total: "—", today: "—", netTotal: "—", netToday: "—", thru, holes };
    }),
  };
}
