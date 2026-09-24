import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { calculateSkins } from "./calculate";

// Deliberately fixed until the confirmed live archive is connected for 2027.
export const SKINS_YEAR = 2026;

export async function get2026Skins(): Promise<Record<string, number>> {
  const service = createSupabaseServiceRoleClient();
  const rounds: { id: string; player_slug: string; round: number; course: string; format: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("archived_scorecard_rounds")
      .select("id, player_slug, round, course, format")
      .like("tournament_slug", `${SKINS_YEAR}-%`).order("id").range(from, from + 999);
    if (error) throw new Error("Could not load skins rounds.");
    rounds.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  if (!rounds.length) throw new Error("No 2026 skins scorecards available.");
  const holes: { round_id: string; hole: number; score: number }[] = [];
  for (let offset = 0; offset < rounds.length; offset += 100) {
    const ids = rounds.slice(offset, offset + 100).map((round) => round.id);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service.from("archived_scorecard_holes")
        .select("round_id, hole, score").in("round_id", ids)
        .order("round_id").order("hole").range(from, from + 999);
      if (error) throw new Error("Could not load skins scores.");
      holes.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return calculateSkins(rounds.map((round) => ({
    player: round.player_slug, round: round.round, course: round.course, format: round.format,
    holes: holes.filter((hole) => hole.round_id === round.id),
  })));
}
