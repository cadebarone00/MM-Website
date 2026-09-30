import { careerArchiveRecords, careerArchiveTeamRecords } from "@/lib/data/careerArchive";
import { pastTournaments } from "@/lib/data";
import type { LiveTournamentSnapshot } from "@/lib/live/types";
import { pages, type Service } from "./futureInputs";
import { buildTournamentSetup, referenceSetup, type ReferenceSetup, type TournamentSetup } from "./tournamentSetup";
import { editionFilter, type EditionScope } from "@/lib/platform/editionScope";

const references = new Map<number, ReferenceSetup | null>();

/** The season's setup with last year's defaults filled in (see tournamentSetup.ts). */
export async function loadTournamentSetup(service: Service, edition: EditionScope, snapshot: LiveTournamentSnapshot): Promise<TournamentSetup> {
  const { seasonYear } = edition;
  const [{ data: settings, error }, roundRows] = await Promise.all([
    service.from("live_tournament_settings").select("round_count").match(editionFilter(edition)).maybeSingle(),
    pages<{ round: number; format: string | null; matchups_locked: boolean }>((from, to) =>
      service.from("live_round_state").select("round, format, matchups_locked").match(editionFilter(edition)).order("round").range(from, to)),
  ]);
  if (error) throw new Error(error.message);
  if (!references.has(seasonYear)) references.set(seasonYear, referenceSetup(seasonYear, careerArchiveRecords, careerArchiveTeamRecords, pastTournaments));
  return buildTournamentSetup({ roundCount: settings?.round_count ?? null, roundRows, snapshot, reference: references.get(seasonYear)! });
}
