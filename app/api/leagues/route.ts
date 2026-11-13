import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createLeague, listMyLeagues } from "@/lib/platform/leaguesServer";
import { courseFrom, dateFrom, handicapFrom } from "@/lib/platform/leaguesRequest";
import { badRequest, reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET: leagues I organize or play in. POST { name, course, date, scoring, plays, handicap }: create one. */
export async function GET() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  return reply(await listMyLeagues(user.id), (leagues) => ({ leagues }));
}

export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { name?: unknown; course?: unknown; date?: unknown; scoring?: unknown; plays?: unknown; handicap?: unknown } | null;
  const course = courseFrom(body?.course), date = dateFrom(body?.date);
  if (typeof body?.name !== "string" || !course || !date || (body.scoring !== "Gross" && body.scoring !== "Net")) return badRequest();
  return reply(await createLeague(user.id, body.name, course, date, body.scoring, body.plays !== false, handicapFrom(body.handicap)), (value) => value);
}
