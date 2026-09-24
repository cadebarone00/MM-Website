// lib/broadcast/publish.ts
//
// publishBroadcastEvent() — called once from each write path, after the
// underlying write already succeeded (master spec §10/§32). Classifies via
// rules.ts, dedups against an existing pending/queued row for the same
// kind + identifying columns (master spec §13), inserts/updates
// broadcast_events. Server-only.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { matchStateChangedRule, matchWonRule, roundFinalRule, roundStartedRule, scorePostedRule } from "./rules";
import type { BroadcastEventDraft, RawBroadcastEvent } from "./types";

function draftFor(event: RawBroadcastEvent, now: Date): BroadcastEventDraft {
  switch (event.kind) {
    case "SCORE_POSTED":
      return scorePostedRule(event, now);
    case "MATCH_STATE_CHANGED":
      return matchStateChangedRule(event, now);
    case "MATCH_WON":
      return matchWonRule(event, now);
    case "ROUND_STARTED":
      return roundStartedRule(event, now);
    case "ROUND_FINAL":
      return roundFinalRule(event, now);
  }
}

interface EventColumns {
  matchBoxId: string | null;
  playerSlug: string | null;
  round: number | null;
  hole: number | null;
}

function columnsFor(event: RawBroadcastEvent): EventColumns {
  switch (event.kind) {
    case "SCORE_POSTED":
      return { matchBoxId: event.matchBoxId, playerSlug: event.playerSlug, round: event.round, hole: event.hole };
    case "MATCH_STATE_CHANGED":
    case "MATCH_WON":
      return { matchBoxId: event.matchBoxId, playerSlug: null, round: event.round, hole: null };
    case "ROUND_STARTED":
    case "ROUND_FINAL":
      return { matchBoxId: null, playerSlug: null, round: event.round, hole: null };
  }
}

/**
 * Dedup filter columns per kind (master spec §13): a player-level event
 * dedups on player+round+hole; a match-level event dedups on the box; a
 * round-level event dedups on the round. Returned as [column, value] pairs
 * so publishBroadcastEvent can chain .eq() for however many apply.
 */
function dedupFilters(event: RawBroadcastEvent): [string, string | number][] {
  switch (event.kind) {
    case "SCORE_POSTED":
      return [["player_slug", event.playerSlug], ["round", event.round], ["hole", event.hole]];
    case "MATCH_STATE_CHANGED":
    case "MATCH_WON":
      return [["match_box_id", event.matchBoxId]];
    case "ROUND_STARTED":
    case "ROUND_FINAL":
      return [["round", event.round]];
  }
}

export async function publishBroadcastEvent(event: RawBroadcastEvent): Promise<void> {
  const now = new Date();
  const draft = draftFor(event, now);
  const columns = columnsFor(event);
  const service = createSupabaseServiceRoleClient();

  let existingId: string | null = null;
  let query = service
    .from("broadcast_events")
    .select("id")
    .eq("season_year", event.seasonYear)
    .eq("kind", event.kind)
    .in("status", ["pending", "queued"]);
  for (const [column, value] of dedupFilters(event)) {
    query = query.eq(column, value);
  }
  const { data: existing, error: selectError } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (selectError) console.error("broadcast_events dedup select failed:", selectError.message);
  existingId = existing?.id ?? null;

  const row = {
    season_year: event.seasonYear,
    kind: event.kind,
    priority: draft.priority,
    status: draft.status,
    payload: draft.payload,
    match_box_id: columns.matchBoxId,
    player_slug: columns.playerSlug,
    round: columns.round,
    hole: columns.hole,
    source: "system",
    expires_at: draft.expiresAt,
    // A dedup-replace is semantically a NEW occurrence of the event, so its
    // aging clock (effectivePriority ages off created_at) must reset — an
    // update that kept the original created_at could let a stale
    // MATCH_STATE_CHANGED row's aged priority out-rank a freshly-inserted
    // MATCH_WON for the same box.
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  if (existingId) {
    const { error } = await service.from("broadcast_events").update(row).eq("id", existingId);
    if (error) console.error("broadcast_events update failed:", error.message);
  } else {
    const { error } = await service.from("broadcast_events").insert(row);
    if (error) console.error("broadcast_events insert failed:", error.message);
  }
}
