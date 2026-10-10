import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMyRoundInvites } from "@/lib/platform/sharedRoundsServer";

/** The Play page's invite cards: my open invites to live rounds. Empty when signed out or not set up yet. */
export async function GET() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: true, invites: [] });
  const result = await listMyRoundInvites(user.id);
  return NextResponse.json({ ok: true, invites: result.ok ? result.value : [] }, { headers: { "Cache-Control": "no-store" } });
}
