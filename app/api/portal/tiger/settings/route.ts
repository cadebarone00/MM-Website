import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { TournamentSettings } from "@/lib/live/types";

export async function GET() {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("live_tournament_settings").select("round_count, completed_at").eq("id", true).maybeSingle();

  const settings: TournamentSettings = {
    roundCount: data?.round_count ?? null,
    completedAt: data?.completed_at ?? null,
  };
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { roundCount } = await request.json();
  if (typeof roundCount !== "number" || roundCount < 6 || roundCount > 10) {
    return NextResponse.json({ ok: false, error: "Round count must be between 6 and 10." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  const { error: settingsError } = await service.from("live_tournament_settings").upsert({ id: true, round_count: roundCount });
  if (settingsError) {
    return NextResponse.json({ ok: false, error: "Could not save the round count." }, { status: 500 });
  }

  // Create any missing round rows for 1..roundCount — never touch rounds
  // that already exist (their date/course/format/locks stay as-is).
  const { data: existing } = await service.from("live_round_state").select("round");
  const existingRounds = new Set((existing ?? []).map((r) => r.round));
  const missing = Array.from({ length: roundCount }, (_, i) => i + 1).filter((round) => !existingRounds.has(round));

  if (missing.length > 0) {
    const { error: insertError } = await service.from("live_round_state").insert(missing.map((round) => ({ round })));
    if (insertError) {
      return NextResponse.json({ ok: false, error: "Could not create the new round slots." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
