// The pre-tournament roster (who Tiger has locked into Maroon/White in
// Master Settings -> Players & Teams, aka getConfirmedRoster()) and the
// live-tournament roster (tournament.roster, only populated once the
// Google Sheet feed is actually running) are two separate sources that
// nothing used to connect. This is the one rule that connects them,
// applied at both places a Tournament gets built (see
// lib/data/fetchLiveTournament.ts and lib/hooks/useLiveTournament.ts) so
// every consumer of tournament.roster sees the confirmed roster before the
// live feed exists, and the live feed's own roster once it does.
import type { Tournament } from "./types";
import type { RosterEntry } from "@/lib/live/types";

export function overlayConfirmedRoster(tournament: Tournament, confirmedRoster: RosterEntry[]): Tournament {
  if (tournament.roster.maroon.length > 0 || tournament.roster.white.length > 0) return tournament;
  if (confirmedRoster.length === 0) return tournament;

  return {
    ...tournament,
    roster: {
      maroon: confirmedRoster.filter((entry) => entry.team === "maroon").map((entry) => entry.playerSlug),
      white: confirmedRoster.filter((entry) => entry.team === "white").map((entry) => entry.playerSlug),
    },
  };
}
