import { cleanInviteCode } from "@/lib/platform/codeInvites";
import { gameDef, type GameId } from "@/lib/platform/roundGames";

/** Play's small rules, matching the website's JoinCodeCard, RoundJoin and RoundInvites. */

/** What's kept from typing in the join box: letters and numbers, upper case, at most 6. */
export const typedJoinCode = (text: string) => cleanInviteCode(text).slice(0, 6);

/** How the join box shows it while typing: "K7Q-4M" after the third character. */
export const shownJoinCode = (code: string) => code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;

export const JOIN_CODE_HINT = "Codes are 6 letters and numbers, like K7Q-4MZ.";

export const holesLabel = (holes: string | null | undefined) => holes === "front" ? "Front 9" : holes === "back" ? "Back 9" : "18 holes";

/** A game's display name, or null for none / an unknown id. */
export function gameName(id: string | null | undefined): string | null {
  if (!id) return null;
  try { return gameDef(id as GameId)?.name ?? null; } catch { return null; }
}

/** The fields of a round invite this app shows (server type RoundInvite in lib/platform/sharedRoundsServer). */
export type InviteSummary = { roundId: string; hostName: string; setup: { course: { name: string }; game?: { id: string } | null } };

/** "Cam invited you to play Eagle Pointe · Skins" */
export function inviteLine(invite: InviteSummary): { host: string; course: string; game: string | null } {
  return { host: invite.hostName, course: invite.setup.course.name, game: gameName(invite.setup.game?.id) };
}

/** The 3 profile numbers on Play home: one decimal, or "?" when not known. */
export const statText = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "?" : value.toFixed(1);
