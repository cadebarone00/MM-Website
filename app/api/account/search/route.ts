import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchAccounts } from "@/lib/platform/sharedRoundsServer";

/** Play a round → invite players: GET /api/account/search?q=<name>. Signed-in only. */
export async function GET(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ ok: true, accounts: await searchAccounts(user.id, q) }, { headers: { "Cache-Control": "no-store" } });
}
