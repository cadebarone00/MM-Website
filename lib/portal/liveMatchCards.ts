// lib/portal/liveMatchCards.ts
//
// Server-only. Builds PortalMatchCard[] for a player's live-season matches
// by reading the same already-published tables the public /api/live/matches
// route and the broadcast feature read (live_match_official_state,
// live_match_odds_snapshots — see lib/broadcast/matchPlayData.ts), plus a
// small live_courses name lookup. No score computation happens here.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CurrentRoundResult } from "@/lib/live/currentRoundForPlayer";
import { liveMatchCard, type PortalMatchCard } from "./matchCards";

export async function buildLiveMatchCards(matches: CurrentRoundResult[]): Promise<PortalMatchCard[]> {
  if (matches.length === 0) return [];

  const service = createSupabaseServiceRoleClient();
  const boxIds = matches.map((m) => m.matchBox.id).filter((id): id is string => Boolean(id));
  const courseIds = [...new Set(matches.map((m) => m.round.courseId).filter((id): id is string => Boolean(id)))];

  const [{ data: officialRows }, { data: oddsRows }, { data: courseRows }] = await Promise.all([
    boxIds.length
      ? service.from("live_match_official_state").select("match_box_id, leader, margin, thru, mathematically_complete").in("match_box_id", boxIds)
      : Promise.resolve({ data: [] as { match_box_id: string; leader: "maroon" | "white" | "tie"; margin: number; thru: number; mathematically_complete: boolean }[] }),
    boxIds.length
      ? service.from("live_match_odds_snapshots").select("match_box_id, maroon_win_probability, white_win_probability, created_at").in("match_box_id", boxIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { match_box_id: string; maroon_win_probability: number | null; white_win_probability: number | null }[] }),
    courseIds.length
      ? service.from("live_courses").select("id, name").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const officialByBox = new Map((officialRows ?? []).map((row) => [row.match_box_id, row]));
  const oddsByBox = new Map<string, { maroon_win_probability: number | null; white_win_probability: number | null }>();
  for (const row of oddsRows ?? []) if (!oddsByBox.has(row.match_box_id)) oddsByBox.set(row.match_box_id, row);
  const courseNameById = new Map((courseRows ?? []).map((row) => [row.id, row.name]));

  return matches.map(({ round, matchBox, state }) => {
    const official = matchBox.id ? officialByBox.get(matchBox.id) : null;
    const odds = matchBox.id ? oddsByBox.get(matchBox.id) : null;
    return liveMatchCard({
      id: matchBox.id ?? `round-${round.round}-box-${matchBox.boxNumber}`,
      status: state === "Final" ? "Past" : state === "Live" ? "Live" : "Upcoming",
      course: round.courseId ? courseNameById.get(round.courseId) ?? null : null,
      round: round.round,
      format: matchBox.format,
      maroonPlayers: matchBox.maroonPlayers,
      whitePlayers: matchBox.whitePlayers,
      teeTime: matchBox.teeTime,
      official: official
        ? { leader: official.leader, margin: official.margin, thru: official.thru, mathematicallyComplete: official.mathematically_complete }
        : null,
      maroonOdds: odds?.maroon_win_probability ?? null,
      whiteOdds: odds?.white_win_probability ?? null,
    });
  });
}
