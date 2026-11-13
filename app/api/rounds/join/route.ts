import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findSharedRoundByCode, joinSharedRoundByCode } from "@/lib/platform/joinCodesServer";
import { cleanInviteCode, isInviteCode } from "@/lib/platform/codeInvites";
import { badRequest, reply, signedOut } from "@/lib/platform/codeTournamentsRequest";

/** GET ?code=: what a round's code opens (before joining); `round: null` when no round has it. POST { code }: join. */
export async function GET(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const code = cleanInviteCode(new URL(request.url).searchParams.get("code") ?? "");
  if (!isInviteCode(code)) return NextResponse.json({ ok: true, round: null });
  return reply(await findSharedRoundByCode(user.id, code), (round) => ({ round }));
}

export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return signedOut();
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? cleanInviteCode(body.code) : "";
  if (!isInviteCode(code)) return badRequest();
  return reply(await joinSharedRoundByCode(user.id, code), (id) => ({ id }));
}
