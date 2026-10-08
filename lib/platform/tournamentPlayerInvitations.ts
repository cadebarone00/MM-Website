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

export type PlayerDeclineResult = "declined" | "already_player" | "not_found";

export function playerDeclineResultFromJson(value: unknown): PlayerDeclineResult {
  const status = value && typeof value === "object" ? (value as Record<string, unknown>).status : null;
  return status === "declined" || status === "already_player" ? status : "not_found";
}

/** Organizer view: each tournament player's invite state for one edition. */
export type PlayerInviteStatus = "joined" | "invited" | "declined" | "none";

export function inviteStatusesFromJson(value: unknown): Record<string, PlayerInviteStatus> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, PlayerInviteStatus] => entry[1] === "joined" || entry[1] === "invited" || entry[1] === "declined" || entry[1] === "none"));
}

/** The page a tournament invite link opens. */
export const tournamentPlayerInvitePath = (token: string) => `/tournaments/invite/${token}`;
