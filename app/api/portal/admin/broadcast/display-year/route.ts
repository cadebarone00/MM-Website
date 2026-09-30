import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidDisplayYear } from "@/lib/broadcast/displayYear";

/** Host-only — switches which year /broadcast shows. See lib/broadcast/displayYear.ts for why this is separate from live_active_season. */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const { year } = await request.json();
  if (!isValidDisplayYear(year)) {
    return NextResponse.json({ ok: false, error: "Invalid year." }, { status: 400 });
  }

  const service = createSupabaseServiceRoleClient();
  const { error } = await service.from("broadcast_display_year").upsert({ id: true, season_year: year });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not switch the displayed year." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
