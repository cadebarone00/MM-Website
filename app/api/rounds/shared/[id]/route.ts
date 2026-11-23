import { NextResponse } from "next/server";
import { sharedRoundInviteCode } from "@/lib/platform/joinCodesServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import * as rounds from "@/lib/platform/sharedRoundsServer";
import type { PersonalRoundSetup } from "@/lib/platform/personalRound";
import type { HoleInput } from "@/lib/platform/roundGames";
import type { ShotResult } from "@/lib/platform/playerRounds";

const status = (code: string) => code === "not_installed" ? 503 : code === "refused" ? 400 : 500;
async function signedIn() { return (await (await createSupabaseServerClient()).auth.getUser()).data.user; }

/** GET: the whole shared round (host and joined players only). Polled by every phone in the round. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const result = await rounds.getSharedRound(user.id, (await params).id);
  if (!result.ok) return NextResponse.json({ ok: false, code: result.code }, { status: status(result.code) });
  if (!result.value) return NextResponse.json({ ok: false, code: "not_in_round" }, { status: 404 });
  // The round's invite code, to share (none until supabase/join_codes.sql is run).
  const code = await sharedRoundInviteCode(user.id, (await params).id);
  return NextResponse.json({ ok: true, round: result.value, me: user.id, inviteCode: code.ok ? code.value : null }, { headers: { "Cache-Control": "no-store" } });
}

type Action =
  | { action: "strokes"; player: string; hole: number; strokes: number | null }
  | { action: "guestStrokes"; guest: string; hole: number; strokes: number | null }
  | { action: "stats"; hole: number; putts: number | null; fairway: ShotResult | null; green: ShotResult | null }
  | { action: "pick"; hole: number; pick: HoleInput }
  | { action: "invite" | "remove"; profileId: string }
  | { action: "setup"; setup: PersonalRoundSetup }
  | { action: "end" | "join" | "decline" | "delete" };

/** POST one change: strokes (host) / a guest's strokes (host) / my own stats, a game pick, join / decline an invite, or
 *  (host) invite / remove / change setup / end / delete the round for everyone. The database checks who may do what. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const id = (await params).id;
  const body = await request.json().catch(() => null) as Action | null;
  const isHole = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 18;
  const isStrokes = (n: unknown) => n === null || (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 20);
  const isShot = (v: unknown): v is ShotResult | null => v === null || ["up", "left", "center", "right", "down"].includes(v as string);
  let result: rounds.Result<null> | null = null;
  switch (body?.action) {
    case "strokes":
      if (isHole(body.hole) && isStrokes(body.strokes)) result = await rounds.setSharedStrokes(user.id, id, body.player, body.hole, body.strokes);
      break;
    case "guestStrokes":
      if (isHole(body.hole) && isStrokes(body.strokes) && typeof body.guest === "string") result = await rounds.setGuestStrokes(user.id, id, body.guest, body.hole, body.strokes);
      break;
    case "stats":
      if (isHole(body.hole) && (body.putts === null || (Number.isInteger(body.putts) && body.putts >= 0 && body.putts <= 10)) && isShot(body.fairway) && isShot(body.green))
        result = await rounds.setSharedStats(user.id, id, body.hole, { putts: body.putts, fairway: body.fairway, green: body.green });
      break;
    case "pick": if (isHole(body.hole) && body.pick && typeof body.pick === "object") result = await rounds.setSharedPick(user.id, id, body.hole, body.pick); break;
    case "invite": result = await rounds.inviteToSharedRound(user.id, id, body.profileId); break;
    case "remove": result = await rounds.removeFromSharedRound(user.id, id, body.profileId); break;
    case "setup": if (body.setup?.course?.par) result = await rounds.updateSharedRound(user.id, id, body.setup, false); break;
    case "end": result = await rounds.updateSharedRound(user.id, id, null, true); break;
    case "delete": result = await rounds.deleteSharedRound(user.id, id); break;
    case "join": case "decline": result = await rounds.answerRoundInvite(user.id, id, body.action === "join"); break;
  }
  if (!result) return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, code: result.code, message: result.message }, { status: status(result.code) });
}
