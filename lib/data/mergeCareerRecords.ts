import { getPlayerSlug } from "./players";
import type { CareerHoleRecord } from "./careerStats";
export const careerRoundKey = (year: number, player: string, round: number) => `${year}:${getPlayerSlug(player)}:${round}`;
/** An editable round replaces the entire imported round, including deleted holes. */
export function mergeCareerRecords(imported: CareerHoleRecord[], edited: CareerHoleRecord[], editedRoundKeys: Set<string>) {
  return [...imported.filter((row) => !editedRoundKeys.has(careerRoundKey(row.year, row.player, row.round))), ...edited];
}
