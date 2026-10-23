import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCodeTournament } from "@/lib/platform/codeTournamentsServer";
import { reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET ?code=K7Q-4MZ: what that code opens (before joining); `tournament: null` when no tournament has it. */
export async function GET(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (code.replace(/[^A-Za-z0-9]/g, "").length !== 6) return NextResponse.json({ ok: true, tournament: null });
  return reply(await findCodeTournament(user.id, code), (tournament) => ({ tournament }));
}
