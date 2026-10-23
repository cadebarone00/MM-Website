import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinCodeTournament } from "@/lib/platform/codeTournamentsServer";
import { badRequest, handicapFrom, reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** POST { code, handicap }: join the tournament with that code. */
export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { code?: unknown; handicap?: unknown } | null;
  if (typeof body?.code !== "string") return badRequest();
  return reply(await joinCodeTournament(user.id, body.code, handicapFrom(body.handicap)), (id) => ({ id }));
}
