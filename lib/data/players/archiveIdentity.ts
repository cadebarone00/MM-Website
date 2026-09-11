import { requirePlayerSlug } from "./index.ts";

const playerFields = new Set(["player", "partner", "player1", "player2", "player_1", "player_2", "partner_1", "partner_2", "opponent_1", "opponent_2"]);

/** Normalize identity fields before any archive import writes. Source workbook snapshots remain provenance. */
export function normalizeArchivePlayerFields<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).map(([field, value]) => {
    if (typeof value !== "string" || !value.trim()) return [field, value];
    if (playerFields.has(field)) return [field, requirePlayerSlug(value)];
    if (field === "maroon_players" || field === "white_players") {
      return [field, value.split(/\s*[&,;|/+]\s*/).map(requirePlayerSlug).join(" & ")];
    }
    return [field, value];
  })) as T;
}
