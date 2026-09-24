import { careerRoundKey, type CareerHoleRecord } from "@/lib/data/careerStats";
import { getPlayerDisplayName } from "@/lib/data/players";
import { isEligibleIndividualHole } from "@/lib/odds/preRoundSingles";

/**
 * Futures are a baseline, so a rostered player with little Career Archive
 * history (a rookie, say) must not hold a market closed. Below this many
 * eligible individual-ball holes (two rounds), the whole field's history is
 * blended in with the player's own as a stand-in. Their own holes keep
 * counting, so they gradually take over as scores come in.
 */
export const MIN_HISTORY_HOLES = 36;

const eligible = (row: CareerHoleRecord) => row.score > 0 && isEligibleIndividualHole(row);

/** Model slugs (as used in the Career Archive) with too little history of their own. */
export function thinPlayers(modelPlayers: string[], records: CareerHoleRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const row of records) if (eligible(row)) counts.set(row.player, (counts.get(row.player) ?? 0) + 1);
  return [...new Set(modelPlayers)].filter((player) => (counts.get(player) ?? 0) < MIN_HISTORY_HOLES);
}

/**
 * `records` plus every eligible field hole re-labelled as each thin player.
 * Each source round keeps its own round key, so the model's full-round
 * shape measure still sees real 18-hole rounds rather than a merged pile.
 */
export function withFieldProxies(records: CareerHoleRecord[], thin: string[]): CareerHoleRecord[] {
  if (!thin.length) return records;
  const field = records.filter(eligible);
  const proxies = thin.flatMap((player) => field.map((row) => ({ ...row, player, roundId: `field-proxy:${row.player}:${careerRoundKey(row)}` })));
  return [...records, ...proxies];
}

/** The card note listing who is being filled in with the field average. */
export function fieldProxyAssumption(rosterPlayers: string[]): string | null {
  if (!rosterPlayers.length) return null;
  const names = rosterPlayers.map(getPlayerDisplayName).join(", ");
  return `${names} ${rosterPlayers.length > 1 ? "have" : "has"} little Career Archive history, so the field's scoring fills in until more of their scores are in.`;
}
