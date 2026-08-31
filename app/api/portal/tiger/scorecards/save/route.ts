// app/api/portal/tiger/scorecards/save/route.ts
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface HoleEdit {
  hole: number;
  score: number;
  putts: number;
  fir: "0" | "1" | "X";
  gir: boolean;
}

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { tournamentSlug, playerSlug, round, holes } = await request.json();
  if (
    typeof tournamentSlug !== "string" ||
    typeof playerSlug !== "string" ||
    typeof round !== "number" ||
    !Array.isArray(holes) ||
    holes.some(
      (h: unknown): h is HoleEdit =>
        typeof h !== "object" ||
        h === null ||
        typeof (h as HoleEdit).hole !== "number" ||
        typeof (h as HoleEdit).score !== "number" ||
        typeof (h as HoleEdit).putts !== "number" ||
        !["0", "1", "X"].includes((h as HoleEdit).fir) ||
        typeof (h as HoleEdit).gir !== "boolean"
    )
  ) {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { data: roundRow } = await service
    .from("archived_scorecard_rounds")
    .select("id")
    .eq("tournament_slug", tournamentSlug)
    .eq("player_slug", playerSlug)
    .eq("round", round)
    .maybeSingle();
  if (!roundRow) {
    return NextResponse.json({ ok: false, error: "That round hasn't been recorded yet." }, { status: 404 });
  }

  for (const edit of holes as HoleEdit[]) {
    const { error } = await service
      .from("archived_scorecard_holes")
      .update({ score: edit.score, putts: edit.putts, fir: edit.fir, gir: edit.gir, host_edited: true, updated_at: new Date().toISOString() })
      .eq("round_id", roundRow.id)
      .eq("hole", edit.hole);
    if (error) {
      return NextResponse.json({ ok: false, error: `Could not save hole ${edit.hole}.` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
