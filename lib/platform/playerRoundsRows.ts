import type { PlayerRound, PlayerRoundHole, RoundSource } from "./playerRounds";

/**
 * Player rounds ↔ the database (supabase/player_rounds.sql). The payload is what save_player_round takes; the round's
 * id is its source key (unique per profile). Rows coming back are checked before the screens use them.
 */
export function playerRoundPayload(round: PlayerRound, sourceLabel: string | null) {
  return {
    source: round.source, sourceKey: round.id, sourceLabel, datePlayed: round.datePlayed, course: round.course, tee: round.tee,
    holesPlayed: round.holesPlayed, format: round.format, holes: round.holes, total: round.total,
    countsForHandicap: round.countsForHandicap, notCountedReason: round.notCountedReason, differential: round.differential, enteredBy: round.enteredBy,
  };
}
export type PlayerRoundPayload = ReturnType<typeof playerRoundPayload>;

const SOURCES: RoundSource[] = ["trip", "tournament", "personal", "history"];
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" ? value : null;
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function fromRow(row: unknown): PlayerRound | null {
  if (!isObject(row) || !isObject(row.course) || !Array.isArray(row.holes)) return null;
  const [id, profileId, datePlayed, name, format] = [text(row.sourceKey), text(row.profileId), text(row.datePlayed), text(row.course.name), text(row.format)];
  const total = num(row.total);
  const source = SOURCES.find((s) => s === row.source);
  if (!id || !profileId || !datePlayed || !name || !format || total === null || !source || (row.holesPlayed !== 9 && row.holesPlayed !== 18)) return null;
  const tee = isObject(row.tee) && text(row.tee.name) ? { name: text(row.tee.name) as string, rating: num(row.tee.rating), slope: num(row.tee.slope) } : null;
  const label = text(row.sourceLabel);
  return {
    id, profileId, source, ...(label && { sourceLabel: label }), datePlayed,
    course: { ref: text(row.course.ref), name, place: text(row.course.place) ?? "" }, tee,
    holesPlayed: row.holesPlayed, format, holes: row.holes as PlayerRoundHole[], total,
    countsForHandicap: row.countsForHandicap === true, notCountedReason: text(row.notCountedReason), differential: num(row.differential),
    enteredBy: row.enteredBy === "organizer" ? "organizer" : "player", status: "submitted",
  };
}

export function playerRoundsFromJson(value: unknown): PlayerRound[] {
  return Array.isArray(value) ? value.map(fromRow).filter((round): round is PlayerRound => round !== null) : [];
}
