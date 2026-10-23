import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { addCodeTournamentRound, endCodeTournament, getCodeTournament, setCodeTournamentStrokes, setCodeTournamentTeeSheet, submitCodeTournamentCard } from "@/lib/platform/codeTournamentsServer";
import type { TeeSheet } from "@/lib/platform/codeTournaments";
import { badRequest, reply, roundFrom, signedOut } from "@/lib/platform/codeTournamentsRequest";

const whole = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
/** A tee sheet as sent: up to 50 groups, each a "HH:MM" time (or "" = TBD), a starting hole and 1–6 player ids. */
function teeSheetFrom(value: unknown): TeeSheet | null {
  const groups = (value as { groups?: unknown } | null)?.groups;
  if (!Array.isArray(groups) || groups.length > 50) return null;
  const clean: TeeSheet["groups"] = [];
  for (const g of groups as { time?: unknown; hole?: unknown; players?: unknown }[]) {
    if (typeof g?.time !== "string" || !/^(([01]\d|2[0-3]):[0-5]\d)?$/.test(g.time) || !whole(g.hole, 1, 18)) return null;
    if (!Array.isArray(g.players) || g.players.length < 1 || g.players.length > 6 || !g.players.every((p) => typeof p === "string" && p.length <= 64)) return null;
    clean.push({ time: g.time, hole: g.hole, players: g.players as string[] });
  }
  return { groups: clean };
}

/** GET: the whole tournament (members only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const result = await getCodeTournament(user.id, id);
  if (result.ok && !result.value) return NextResponse.json({ ok: false, code: "not_member" }, { status: 404 });
  // The organizer also gets the watch code (none until supabase/watch_codes.sql is run).
  if (result.ok && result.value?.organizer === user.id) {
    const { data } = await createSupabaseServiceRoleClient().from("code_tournaments").select("watch_code").eq("id", id).maybeSingle();
    if (data?.watch_code) result.value.watchCode = data.watch_code as string;
  }
  return reply(result, (tournament) => ({ tournament }));
}

/**
 * POST { action }: "strokes" { round, hole, strokes (null clears) } · "submit" { round } (my card) · "addRound" { setup, date }
 * "teeSheet" { round, teeSheet } and "end" (organizer only).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { action?: string; round?: unknown; hole?: unknown; strokes?: unknown; setup?: unknown; date?: unknown; teeSheet?: unknown } | null;
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
    case "teeSheet": {
      const sheet = teeSheetFrom(body.teeSheet);
      if (!whole(body.round, 1, 10) || !sheet) return badRequest();
      return reply(await setCodeTournamentTeeSheet(user.id, id, body.round, sheet), () => ({}));
    }
    case "end":
      return reply(await endCodeTournament(user.id, id), () => ({}));
    default:
      return badRequest();
  }
}
