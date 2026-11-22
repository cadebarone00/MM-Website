import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { personalRound, type PersonalRoundSetup } from "@/lib/platform/personalRound";
import { saveMyPlayerRound } from "@/lib/platform/playerRoundsServer";
import type { PlayerRound, ScoredCard } from "@/lib/platform/playerRounds";
import { getSharedRound, updateSharedRound } from "@/lib/platform/sharedRoundsServer";
import { memberCard, memberSetup } from "@/lib/platform/sharedRoundCards";

/**
 * Play a round → Submit & Save: saves the signed-in player's own card (player_rounds, source "personal"). In a shared
 * round `startedAt` is the round's id, so each card saves once. The host keeps score there (owner request 2026-11-21):
 * the host's submit also saves every joined player's round from the scores in the round (the host attests, like a
 * League group card), then ends the round. Guests are never saved.
 */
export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  let round: PlayerRound;
  let startedAt = "";
  try {
    const body = await request.json() as { setup: PersonalRoundSetup; card: ScoredCard; startedAt: string };
    if (typeof body?.startedAt !== "string" || !body.setup?.course?.par || !Array.isArray(body.card?.strokes)) throw new Error("Missing round data.");
    round = personalRound(user.id, body.setup, body.card, body.startedAt);
    startedAt = body.startedAt;
  } catch (error) {
    return NextResponse.json({ ok: false, code: "bad_round", message: error instanceof Error ? error.message : "Bad round." }, { status: 400 });
  }
  try {
    const saved = await saveMyPlayerRound(user.id, round, null);
    const members = await saveMembersRounds(user.id, startedAt);
    return NextResponse.json({ ok: true, round: saved.round, members });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Personal round save failed:", message);
    // Until supabase/player_rounds.sql is run, the save function doesn't exist yet.
    const notInstalled = /save_player_round|function|does not exist|schema cache/i.test(message);
    return NextResponse.json({ ok: false, code: notInstalled ? "not_installed" : "failed" }, { status: notInstalled ? 503 : 500 });
  }
}

type MemberSave = { name: string; saved: boolean };

/** When I'm the host of shared round `id`: save each joined player's round (never throws; a player not saved is listed). */
async function saveMembersRounds(me: string, id: string): Promise<MemberSave[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return [];
  const loaded = await getSharedRound(me, id);
  if (!loaded.ok || !loaded.value || loaded.value.host !== me || loaded.value.guestHoles === undefined) return [];
  const shared = loaded.value;
  const members = shared.players.filter((p) => p.status === "joined" && p.profileId !== me);
  const results = await Promise.all(members.map(async (member): Promise<MemberSave> => {
    const card = memberCard(shared, member.profileId);
    if (!card) return { name: member.name, saved: false };
    try {
      await saveMyPlayerRound(member.profileId, personalRound(member.profileId, memberSetup(shared.setup), card, id), null);
      return { name: member.name, saved: true };
    } catch (error) {
      console.error("Saving a player's shared round failed:", error instanceof Error ? error.message : error);
      return { name: member.name, saved: false };
    }
  }));
  if (shared.status === "live") await updateSharedRound(me, id, null, true);
  return results;
}
