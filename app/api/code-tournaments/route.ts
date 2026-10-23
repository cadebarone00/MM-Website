import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCodeTournament, listMyCodeTournaments, type NewRound } from "@/lib/platform/codeTournamentsServer";
import { badRequest, handicapFrom, reply, roundFrom, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET: tournaments I organize or play in. POST { name, scoring, plays, handicap, rounds: [{ setup, date }] }: create one. */
export async function GET() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  return reply(await listMyCodeTournaments(user.id), (tournaments) => ({ tournaments }));
}

export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { name?: unknown; scoring?: unknown; plays?: unknown; handicap?: unknown; rounds?: unknown } | null;
  const rounds = Array.isArray(body?.rounds) ? body.rounds.map(roundFrom) : [];
  if (typeof body?.name !== "string" || (body.scoring !== "Gross" && body.scoring !== "Net") || !rounds.length || rounds.some((r) => !r)) return badRequest();
  return reply(await createCodeTournament(user.id, body.name, body.scoring, body.plays !== false, handicapFrom(body.handicap), rounds as NewRound[]), (made) => made);
}
