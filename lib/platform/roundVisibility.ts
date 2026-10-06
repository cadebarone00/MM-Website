import type { PlayerRound } from "./playerRounds";
import type { RoundsVisibility } from "./playerRoundsPrivacy";

/** A new personal ("just playing") round starts matching the player's Privacy setting (add-on decision 11). */
export const defaultRoundVisibility = (profile: RoundsVisibility): RoundsVisibility => profile;

/**
 * Profile → Rounds: the owner's rounds this viewer may see. Removed rounds never show (decision 15). The owner sees the
 * rest. Others need a Public profile; a personal round also has to be Public itself (no setting = the profile's).
 */
export function profileRounds(rounds: PlayerRound[], { viewerId, ownerId, profileVisibility }: { viewerId: string; ownerId: string; profileVisibility: RoundsVisibility }): PlayerRound[] {
  return rounds.filter((round) => round.profileId === ownerId && !round.removedFromProfile && (viewerId === ownerId
    || (profileVisibility === "public" && (round.source !== "personal" || (round.visibility ?? profileVisibility) === "public"))));
}
