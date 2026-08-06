import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const { data } = await supabase.from("wagers_market_settlements").select("market_key, winning_selection_key");

  return NextResponse.json({
    ok: true,
    settlements: (data ?? []).map((row) => ({ marketKey: row.market_key, winningSelectionKey: row.winning_selection_key })),
  });
}
