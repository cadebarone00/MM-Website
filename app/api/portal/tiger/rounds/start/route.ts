import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidSeasonYear } from "@/lib/live/activeSeason";
import { publishBroadcastEvent } from "@/lib/broadcast/publish";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year, round } = await request.json();
  if (!isValidSeasonYear(year) || typeof round !== "number" || !Number.isInteger(round)) {
    return NextResponse.json({ ok: false, error: "Missing round." }, { status: 400 });
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("start_live_round_atomic", { p_year: year, p_round: round });
  if (error) return NextResponse.json({ ok: false, error: error.code === "P0001" ? error.message : "Could not start this round. Retry safely." }, { status: 400 });

  try {
    await publishBroadcastEvent({ kind: "ROUND_STARTED", seasonYear: year, round });
  } catch (err) {
    console.error("broadcast publish failed:", err);
  }

  return NextResponse.json({ ok: true });
}
