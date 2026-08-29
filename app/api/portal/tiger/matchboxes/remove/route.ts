import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { id } = await request.json();
  if (typeof id !== "string") {
    return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { data: box } = await service.from("live_match_boxes").select("round").eq("id", id).single();
  if (!box) {
    return NextResponse.json({ ok: false, error: "Match box not found." }, { status: 404 });
  }

  const { data: roundRow } = await service.from("live_round_state").select("matchups_locked").eq("round", box.round).single();
  if (roundRow?.matchups_locked) {
    return NextResponse.json({ ok: false, error: "Unlock this round's matchups before removing a match box." }, { status: 400 });
  }

  const { error } = await service.from("live_match_boxes").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not remove that match box." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
