import type { SkinOpponent } from "./calculate";

export function nameSkinOpponents(opponents: SkinOpponent[], names: Map<string, string>) {
  return opponents.map((opponent) => {
    const name = names.get(opponent.player) ?? opponent.player.replaceAll("-", " ");
    const parts = name.trim().split(/\s+/);
    const initials = `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
    return { ...opponent, name, initials };
  }).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.player.localeCompare(b.player));
}
