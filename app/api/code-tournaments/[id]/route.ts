import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addCodeTournamentRound, endCodeTournament, getCodeTournament, setCodeTournamentStrokes, submitCodeTournamentCard } from "@/lib/platform/codeTournamentsServer";
import { badRequest, reply, roundFrom, signedOut } from "@/lib/platform/codeTournamentsRequest";

const whole = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;

/** GET: the whole tournament (members only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const result = await getCodeTournament(user.id, id);
  if (result.ok && !result.value) return NextResponse.json({ ok: false, code: "not_member" }, { status: 404 });
  return reply(result, (tournament) => ({ tournament }));
}

/**
 * POST { action }: "strokes" { round, hole, strokes (null clears) } · "submit" { round } (my card) · "addRound" { setup, date }
 * and "end" (organizer only).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { action?: string; round?: unknown; hole?: unknown; strokes?: unknown; setup?: unknown; date?: unknown } | null;
  switch (body?.action) {
    case "strokes":
      if (!whole(body.round, 1, 10) || !whole(body.hole, 1, 18) || !(body.strokes === null || whole(body.strokes, 1, 20))) return badRequest();
      return reply(await setCodeTournamentStrokes(user.id, id, body.round, body.hole, body.strokes), () => ({}));
    case "submit":
      if (!whole(body.round, 1, 10)) return badRequest();
      return reply(await submitCodeTournamentCard(user.id, id, body.round), () => ({}));
    case "addRound": {
      const round = roundFrom({ setup: body.setup, date: body.date });
      if (!round) return badRequest();
      return reply(await addCodeTournamentRound(user.id, id, round), (number) => ({ number }));
    }
    case "end":
      return reply(await endCodeTournament(user.id, id), () => ({}));
    default:
      return badRequest();
  }
}
