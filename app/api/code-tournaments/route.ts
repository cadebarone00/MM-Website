import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCodeTournament, listMyCodeTournaments, setCodeTournamentCut, type NewRound } from "@/lib/platform/codeTournamentsServer";
import { badRequest, cutFrom, handicapFrom, reply, roundFrom, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET: tournaments I organize or play in. POST { name, scoring, plays, handicap, rounds: [{ setup, date }], cut? }: create one. */
export async function GET() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  return reply(await listMyCodeTournaments(user.id), (tournaments) => ({ tournaments }));
}

export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { name?: unknown; scoring?: unknown; plays?: unknown; handicap?: unknown; rounds?: unknown; cut?: unknown } | null;
  const rounds = Array.isArray(body?.rounds) ? body.rounds.map(roundFrom) : [];
  const cut = cutFrom(body?.cut);
  if (typeof body?.name !== "string" || (body.scoring !== "Gross" && body.scoring !== "Net") || !rounds.length || rounds.some((r) => !r) || cut === undefined || (cut && cut.after >= rounds.length)) return badRequest();
  const made = await createCodeTournament(user.id, body.name, body.scoring, body.plays !== false, handicapFrom(body.handicap), rounds as NewRound[]);
  // The cut is saved right after (supabase/tournament_cuts.sql); if it can't be, the organizer sets it from the tournament page.
  if (made.ok && cut) await setCodeTournamentCut(user.id, made.value.id, cut);
  return reply(made, (value) => value);
}
