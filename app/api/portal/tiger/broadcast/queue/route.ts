import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!(await requireHost())) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year)) return NextResponse.json({ ok: false, error: "A season year is required." }, { status: 400 });
  const service = createSupabaseServiceRoleClient();
  const [{ data: events }, { data: videos }] = await Promise.all([
    service.from("broadcast_events").select("id, kind, status, player_slug, round, hole, created_at").eq("season_year", year).in("status", ["pending", "queued", "ready", "playing"]).order("created_at"),
    service.from("broadcast_player_video_queue").select("id, status, player_name, round, hole, shot_number, queued_at").eq("season_year", year).in("status", ["queued", "transition", "playing"]).order("queued_at"),
  ]);
  const items = [
    ...(events ?? []).map((event) => ({
      id: event.id,
      scene: event.kind === "SCORE_POSTED" ? "individual" : event.kind === "MATCH_STATE_CHANGED" || event.kind === "MATCH_WON" ? "match" : "individual",
      status: event.status,
      label: event.kind === "SCORE_POSTED" ? `${event.player_slug ?? "Player"} · R${event.round ?? "?"} · Hole ${event.hole ?? "?"}` : event.kind.replaceAll("_", " "),
      queuedAt: event.created_at,
    })),
    ...(videos ?? []).map((video) => ({ id: video.id, scene: "video", status: video.status, label: `${video.player_name} · R${video.round} · Hole ${video.hole} · Shot ${video.shot_number}`, queuedAt: video.queued_at })),
  ];
  return NextResponse.json({ ok: true, items });
}
