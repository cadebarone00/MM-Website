import { careerArchiveRecords, careerArchiveTeamRecords } from "@/lib/data/careerArchive";
import { pastTournaments } from "@/lib/data";
import type { LiveTournamentSnapshot } from "@/lib/live/types";
import { pages, type Service } from "./futureInputs";
import { buildTournamentSetup, referenceSetup, type ReferenceSetup, type TournamentSetup } from "./tournamentSetup";

const references = new Map<number, ReferenceSetup | null>();

/** The season's setup with last year's defaults filled in (see tournamentSetup.ts). */
export async function loadTournamentSetup(service: Service, seasonYear: number, snapshot: LiveTournamentSnapshot): Promise<TournamentSetup> {
  const [{ data: settings, error }, roundRows] = await Promise.all([
    service.from("live_tournament_settings").select("round_count").eq("season_year", seasonYear).maybeSingle(),
    pages<{ round: number; format: string | null; matchups_locked: boolean }>((from, to) =>
      service.from("live_round_state").select("round, format, matchups_locked").eq("season_year", seasonYear).order("round").range(from, to)),
  ]);
  if (error) throw new Error(error.message);
  if (!references.has(seasonYear)) references.set(seasonYear, referenceSetup(seasonYear, careerArchiveRecords, careerArchiveTeamRecords, pastTournaments));
  return buildTournamentSetup({ roundCount: settings?.round_count ?? null, roundRows, snapshot, reference: references.get(seasonYear)! });
}
