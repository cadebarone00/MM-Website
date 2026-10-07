import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roundsVisibilityFromBody } from "@/lib/platform/playerRoundsPrivacy";
import { setMyRoundsVisibility } from "@/lib/platform/playerRoundsServer";

/** Settings → Privacy: PUT { visibility: "public" | "private" } for the signed-in account's Rounds. */
export async function PUT(request: Request) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Log in to change your privacy." }, { status: 401 });

  const visibility = roundsVisibilityFromBody(await request.json().catch(() => null));
  if (!visibility) return NextResponse.json({ ok: false, error: "Choose Public or Private." }, { status: 400 });

  const result = await setMyRoundsVisibility(user.id, visibility);
  if (result === "not-installed") return NextResponse.json({ ok: false, error: "Privacy settings aren't switched on yet." }, { status: 503 });
  if (result === "failed") return NextResponse.json({ ok: false, error: "We couldn't save that. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, visibility });
}
