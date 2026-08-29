import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { round, lock, value } = await request.json();
  if (typeof round !== "number" || (lock !== "course" && lock !== "matchups") || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "Missing or invalid fields." }, { status: 400 });
  }

  if (lock === "matchups") {
    // Matchups don't exist yet — this plan only ships Courses & Format.
    // The route shape is final; the next plan implements this branch.
    return NextResponse.json({ ok: false, error: "Matchups aren't built yet." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();

  if (value) {
    const { data: current } = await service.from("live_round_state").select("date, course_id, format").eq("round", round).single();
    if (!current?.date || !current?.course_id || !current?.format) {
      return NextResponse.json({ ok: false, error: "Set a date, course, and format before locking this round." }, { status: 400 });
    }
  }

  const { error } = await service.from("live_round_state").update({ course_locked: value }).eq("round", round);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not update the lock." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
