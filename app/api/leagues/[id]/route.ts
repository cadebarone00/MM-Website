import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { copyLeague, deleteLeague, endLeague, getLeague, setLeagueGroupGame, setLeagueGroups, setLeagueSettings, setLeagueStrokes, submitLeagueGroup } from "@/lib/platform/leaguesServer";
import { changeFrom, dateFrom } from "@/lib/platform/leaguesRequest";
import { badRequest, reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET: the whole league (members only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const result = await getLeague(user.id, id);
  if (result.ok && !result.value) return NextResponse.json({ ok: false, code: "not_member" }, { status: 404 });
  return reply(result, (league) => ({ league, me: user.id }));
}

/**
 * POST a change (lib/platform/leagues.ts LeagueChange): "settings", "groups" and "end" (organizer); "strokes" { player,
 * hole, strokes }, "game" { group, game, inputs } and "submit" { group } (the group's scorer or the organizer).
 * "copy" { date } (organizer): a new league with the same players and settings.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { action?: unknown; date?: unknown } | null;
  if (body?.action === "copy") {
    const date = dateFrom(body.date);
    return date ? reply(await copyLeague(user.id, id, date), (value) => value) : badRequest();
  }
  const change = changeFrom(body);
  if (!change) return badRequest();
  switch (change.action) {
    case "settings": return reply(await setLeagueSettings(user.id, id, change.scoring, change.skins, change.pairs), () => ({}));
    case "groups": return reply(await setLeagueGroups(user.id, id, change.groups), () => ({}));
    case "strokes": return reply(await setLeagueStrokes(user.id, id, change.player, change.hole, change.strokes), () => ({}));
    case "game": return reply(await setLeagueGroupGame(user.id, id, change.group, change.game, change.inputs), () => ({}));
    case "submit": return reply(await submitLeagueGroup(user.id, id, change.group), () => ({}));
    case "end": return reply(await endLeague(user.id, id), () => ({}));
  }
}

/** DELETE: the organizer deletes the league for everyone (League Settings → Delete league). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  return reply(await deleteLeague(user.id, id), () => ({}));
}
