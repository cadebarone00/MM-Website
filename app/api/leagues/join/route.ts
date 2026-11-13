import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinLeague } from "@/lib/platform/leaguesServer";
import { handicapFrom } from "@/lib/platform/leaguesRequest";
import { badRequest, reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** POST { code, handicap }: join the league with that code. */
export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { code?: unknown; handicap?: unknown } | null;
  if (typeof body?.code !== "string") return badRequest();
  return reply(await joinLeague(user.id, body.code, handicapFrom(body.handicap)), (id) => ({ id }));
}
