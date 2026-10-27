import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCodeTournament } from "@/lib/platform/codeTournamentsServer";
import { inviteRows } from "@/lib/platform/inviteImport";
import { sendTournamentInvites } from "@/lib/platform/tournamentInvites";

/**
 * POST { invites: [{ name, email, handicap }] } (organizer only): saves an invite for each player and emails them
 * "Join <tournament>" with the code and their link. Returns how many went out, and every link (to share by hand when
 * email isn't set up, or for any that failed).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const body = await request.json().catch(() => null) as { invites?: unknown } | null;
  if (!Array.isArray(body?.invites)) return NextResponse.json({ ok: false, message: "Add some players first." }, { status: 400 });
  const t = await getCodeTournament(user.id, id);
  if (!t.ok || !t.value || t.value.organizer !== user.id) return NextResponse.json({ ok: false, code: "refused", message: "Only the organizer can invite players." }, { status: 403 });
  // The same checks as the page's preview.
  const { invites } = inviteRows((body.invites as Record<string, unknown>[]).map((r) => ({ Name: r?.name, Email: r?.email, Handicap: r?.handicap ?? "" })), t.value.scoring === "Net");
  if (!invites.length) return NextResponse.json({ ok: false, message: "None of those players can be invited. Check the names and emails." }, { status: 400 });
  const result = await sendTournamentInvites(user.id, id, invites, new URL(request.url).origin);
  return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: result.code === "not_installed" ? 503 : result.code === "refused" ? 400 : 500 });
}
