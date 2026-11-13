import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findLeague } from "@/lib/platform/leaguesServer";
import { reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET ?code=LG7-K2Q: what that code opens (before joining); `league: null` when no league has it. */
export async function GET(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (code.replace(/[^A-Za-z0-9]/g, "").length !== 6) return NextResponse.json({ ok: true, league: null });
  return reply(await findLeague(user.id, code), (league) => ({ league }));
}
