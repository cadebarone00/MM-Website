/**
 * Tournament player claiming (supabase/tournament_player_identity.sql). A golfer the organizer added is a
 * tournament_players row with no profile; their invite link lets them, signed in, attach their PROFILE to that same
 * row. profile_id = who the golfer is; tournament_players.id = their place in this tournament (kept across years);
 * edition_roster = their team / handicap in one edition. The link's secret is made on the server; only a hash is stored.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPlayerId = (value: string) => UUID.test(value);

/** What an invite link may show its holder: never the email or anyone's profile id. */
export interface TournamentPlayerInvitation {
  tournamentId: string; tournamentName: string; tournamentSlug: string; playerName: string;
  status: "open" | "yours" | "already_player" | "claimed";
}

export function playerInvitationFromJson(value: unknown): TournamentPlayerInvitation | null {
  const r = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const text = (v: unknown) => typeof v === "string" && v ? v : null;
  const status = r?.status;
  if (!r || !text(r.tournamentId) || !text(r.tournamentName) || !text(r.tournamentSlug) || !text(r.playerName)
    || !(status === "open" || status === "yours" || status === "already_player" || status === "claimed")) return null;
  return { tournamentId: r.tournamentId as string, tournamentName: r.tournamentName as string, tournamentSlug: r.tournamentSlug as string, playerName: r.playerName as string, status };
}

export type PlayerAcceptResult =
  | { status: "accepted" | "already_player"; tournamentId: string }
  | { status: "claimed" }
  | { status: "not_found" };

export function playerAcceptResultFromJson(value: unknown): PlayerAcceptResult {
  const r = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if ((r.status === "accepted" || r.status === "already_player") && typeof r.tournamentId === "string") return { status: r.status, tournamentId: r.tournamentId };
  return r.status === "claimed" ? { status: "claimed" } : { status: "not_found" };
}
