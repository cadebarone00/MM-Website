import type { PlayerRound, PlayerRoundHole, RoundProvenance, RoundSource } from "./playerRounds";

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

const SOURCES: RoundSource[] = ["trip", "tournament", "personal", "history", "legacy"];
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
  const ids = Object.fromEntries((["tripId", "tripRoundId", "editionId", "editionRoundId", "tournamentPlayerId", "personalRoundId", "scorecardSubmissionId"] as const)
    .flatMap((key) => text(row[key]) ? [[key, text(row[key]) as string]] : []));
  const revision = num(row.submissionRevision);
  const visibility = row.visibility === "public" || row.visibility === "private" ? row.visibility : null;
  const p = isObject(row.provenance) && text(row.provenance.system) ? row.provenance : null;
  const provenance: RoundProvenance | null = p ? { system: text(p.system) as string, ...(num(p.seasonYear) !== null && { seasonYear: num(p.seasonYear) as number }),
    ...(num(p.round) !== null && { round: num(p.round) as number }), ...(text(p.tournamentSlug) && { tournamentSlug: text(p.tournamentSlug) as string }) } : null;
  return {
    id, profileId, source, ...ids, ...(label && { sourceLabel: label }), datePlayed,
    course: { ref: text(row.course.ref), name, place: text(row.course.place) ?? "" }, tee,
    holesPlayed: row.holesPlayed, format, holes: row.holes as PlayerRoundHole[], total,
    countsForHandicap: row.countsForHandicap === true, notCountedReason: text(row.notCountedReason), differential: num(row.differential),
    enteredBy: row.enteredBy === "organizer" ? "organizer" : "player", status: "submitted",
    ...(revision !== null && { submissionRevision: revision }), ...(visibility && { visibility }), ...(row.removedFromProfile === true && { removedFromProfile: true }), ...(provenance && { provenance }),
  };
}

export function playerRoundsFromJson(value: unknown): PlayerRound[] {
  return Array.isArray(value) ? value.map(fromRow).filter((round): round is PlayerRound => round !== null) : [];
}

/** A round as Profile → Rounds shows it: no profile id and no scoring-side ids, whoever is looking. */
export type ProfileHistoryRound = Omit<PlayerRound, "profileId" | "scorecardSubmissionId" | "tournamentPlayerId" | "removedFromProfile" | "provenance">;

/** list_profile_rounds rows (other viewers' rows come without a profile id, so one is filled in only to check the row). */
export function profileHistoryFromJson(value: unknown): ProfileHistoryRound[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): ProfileHistoryRound[] => {
    const round = isObject(row) ? fromRow({ ...row, profileId: "shown" }) : null;
    if (!round) return [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { profileId, scorecardSubmissionId, tournamentPlayerId, removedFromProfile, provenance, ...shown } = round;
    return [shown];
  });
}
