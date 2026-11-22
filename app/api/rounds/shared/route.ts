import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSharedRound, myLiveSharedRound, scorekeeperReady, type Result } from "@/lib/platform/sharedRoundsServer";
import type { PersonalRoundSetup } from "@/lib/platform/personalRound";

const reply = <T,>(result: Result<T>, value: (v: T) => object) => result.ok ? NextResponse.json({ ok: true, ...value(result.value) })
  : NextResponse.json({ ok: false, code: result.code, message: result.message }, { status: result.code === "not_installed" ? 503 : result.code === "refused" ? 400 : 500 });

/** GET: my live shared round (to pick it up on this phone). POST { setup, invites }: start a shared round (invites,
 *  a join code or guests; guests and player stats need supabase/shared_round_scorekeeper.sql). */
export async function GET() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  return reply(await myLiveSharedRound(user.id), (id) => ({ id }));
}

export async function POST(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const body = await request.json().catch(() => null) as { setup?: PersonalRoundSetup; invites?: unknown } | null;
  const invites = Array.isArray(body?.invites) ? body.invites.filter((v): v is string => typeof v === "string") : [];
  if (!body?.setup?.course?.par) return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  if ((body.setup.guests?.length || body.setup.playerStats) && !(await scorekeeperReady()))
    return NextResponse.json({ ok: false, code: "not_installed", message: "Guests and player stats need the database update (supabase/shared_round_scorekeeper.sql). Remove them to start." }, { status: 503 });
  return reply(await createSharedRound(user.id, body.setup, invites), (id) => ({ id }));
}
