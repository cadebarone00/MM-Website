import { plannedRounds, tripDates, type GolfTripDraft } from "./golfTripDraft.ts";
import { FORMAT_NAMES, type SetupValues } from "./savedTripSetup.ts";
import { presetById, type CompetitionTypes, type FormatName } from "./tripFormatPresets.ts";

const TEAM_BY_STRUCTURE: Record<string, CompetitionTypes["team"]> = { "two-teams": "2 Teams", pairs: "Pairs", individual: null };

/**
 * What Trip Builder's competition answers (team structure + format) save into the trip's Settings right after
 * Create, written the way Settings stores them so Settings opens showing the same choices. Null when the group
 * isn't competing. Round keys are `${day from the trip's first day}-${slot}`, like the Golf Schedule.
 */
export function tripBuilderSetupValues(draft: GolfTripDraft): SetupValues | null {
  if (draft.competing !== "yes") return null;
  const dates = tripDates(draft.startDate, draft.endDate);
  const players = Math.min(64, Math.max(1, Math.trunc(Number(draft.playerCount)) || 8));
  const preset = presetById(draft.formatPreset);
  const structureTeam = draft.teamStructure && draft.teamStructure in TEAM_BY_STRUCTURE ? TEAM_BY_STRUCTURE[draft.teamStructure] : undefined;
  const team = preset ? (preset.types.team ? structureTeam ?? preset.types.team : null) : structureTeam ?? null;
  const individual = preset ? preset.types.individual : structureTeam === null ? "Stroke Play" : null;

  const rounds = plannedRounds(draft);
  const perDay: Record<number, number> = Object.fromEntries(dates.map((_, index) => [index, 0]));
  const keys: string[] = [];
  for (const round of rounds) {
    const day = round.date ? dates.indexOf(round.date) : round.dayNumber - 1;
    if (day < 0) continue;
    keys.push(`${day}-${perDay[day] ?? 0}`);
    perDay[day] = (perDay[day] ?? 0) + 1;
  }

  const values: SetupValues = {
    dayCount: dates.length, arrivalShift: 0, golfOnArrival: true, golfOnDeparture: true, roundsPerDay: perDay,
    playerTotal: players, localCompetitionType: { individual, team },
  };
  const formatFor = (index: number): FormatName | null => {
    if (draft.formatPreset === "custom") {
      const picked = draft[`round${index + 1}Format`];
      return (FORMAT_NAMES as readonly string[]).includes(picked ?? "") ? picked as FormatName : null;
    }
    return preset && preset.types.team ? preset.formatForRound(index, keys.length) : null;
  };
  const compFormats: Record<string, unknown> = {};
  keys.forEach((key, index) => {
    const format = formatFor(index);
    if (!format) return;
    const stroke = format === "Stroke Play" || format === "Stableford";
    compFormats[key] = { players, pointsPerMatch: 1, matchType: stroke ? "Stroke Play" : "Match Play", nassau: false, scoring: "Gross", format };
  });
  if (Object.keys(compFormats).length) values.compFormats = compFormats;
  return values;
}
