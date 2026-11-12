import { buildPlayerRound } from "./playerRounds";
import { tripStats } from "./tripStats";
import type { SpectatorTrip } from "./watchView";
import type { TripStatsView } from "@/components/platform/GolfTripStats";

/** Public selected-round stats only: submitted complete cards, actual strokes and confirmed pars. */
export function tapInStats({ savedTrip, scoring }: SpectatorTrip): TripStatsView {
  const empty: TripStatsView = { players: [], trip: null, rounds: [] };
  if (!scoring || scoring.pars?.pars.length !== 18) return empty;
  const pars = scoring.pars.pars;
  if (pars.some(par => !Number.isInteger(par) || par < 3 || par > 6)) return empty;
  const round = savedTrip.rounds.find(item => item.roundNumber === scoring.roundNumber);
  const rounds = savedTrip.members.flatMap(member => {
    const submitted = scoring.groups.some(group => group.players.some(player => player.profileId === member.profileId && player.submittedAt));
    if (!submitted || !member.profileId) return [];
    const entries = Array.from({ length: 18 }, (_, hole) => scoring.entries.find(entry => entry.hole === hole + 1
      && entry.scoredProfileId === member.profileId && entry.enteredByProfileId === member.profileId));
    if (entries.some(entry => !entry || entry.strokes === null)) return [];
    try {
      return [buildPlayerRound({ id: `${scoring.roundId}-${member.profileId}`, profileId: member.profileId,
        source: "trip", tripId: savedTrip.trip.id, datePlayed: round?.playDate ?? "", enteredBy: "player",
        course: { ref: null, name: round?.courseName || "Course TBD", place: "" }, tee: null, holesPlayed: 18, format: "Stroke Play",
        holes: entries.map((entry, index) => ({ number: index + 1, par: pars[index], strokes: entry!.strokes!,
          putts: entry!.putts ?? null, fairway: entry!.fairway ?? null, green: entry!.green ?? null })) })];
    } catch { return []; }
  });
  const totals = tripStats(rounds, savedTrip.trip.id);
  return { ...totals, players: totals.players.map(player => ({ ...player,
    name: savedTrip.members.find(member => member.profileId === player.profileId)?.displayName ?? "Player" })), rounds };
}
