import type { PersonalRoundSetup } from "./personalRound.ts";
import type { HoleInput } from "./roundGames.ts";
import type { ShotResult } from "./playerRounds.ts";

/**
 * A round with friends as the server sends it (supabase/shared_rounds.sql + shared_round_scorekeeper.sql). Types only,
 * so screens on the website and in the Expo app can use them without the server code (sharedRoundsServer.ts re-exports them).
 */
export type SharedPlayerStatus = "invited" | "joined" | "declined" | "removed";
export interface SharedRound {
  id: string; host: string; status: "live" | "ended"; setup: PersonalRoundSetup; startedAt: string;
  players: { profileId: string; name: string; position: number; status: SharedPlayerStatus }[];
  holes: { profileId: string; hole: number; strokes: number | null; putts?: number | null; fairway?: ShotResult | null; green?: ShotResult | null }[];
  /** Missing until shared_round_scorekeeper.sql is run. */
  guestHoles?: { guestId: string; hole: number; strokes: number | null }[];
  picks: { hole: number; pick: HoleInput }[];
}
export interface RoundInvite { roundId: string; hostName: string; setup: PersonalRoundSetup; startedAt: string }
