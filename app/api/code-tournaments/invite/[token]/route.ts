import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { initializeProfile } from "@/lib/profile/profileInitialization";
import { isTournamentInviteToken } from "@/lib/platform/inviteImport";
import { acceptTournamentInvite, getTournamentInvite } from "@/lib/platform/tournamentInvites";
import { handicapFrom } from "@/lib/platform/codeTournamentsRequest";

/** GET: the invite link's preview (the tournament it's for), the same one the website's invite page shows. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTournamentInviteToken(token)) return NextResponse.json({ ok: true, invite: null }, { headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ ok: true, invite: await getTournamentInvite(token) }, { headers: { "Cache-Control": "private, no-store" } });
}

/** POST { handicap? }: the signed-in person joins the tournament from their invite link (a new account gets its profile first). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isTournamentInviteToken(token)) return NextResponse.json({ ok: false, message: "This invite link isn't valid." }, { status: 404 });
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  let profileId = current.status === "ok" ? current.profile.profileId : current.status === "incomplete" ? current.profileId : null;
  if (!profileId) {
    const initialized = await initializeProfile(current.account.id);
    if (initialized.status !== "ok") return NextResponse.json({ ok: false, message: "Finish making your profile, then open the link again." }, { status: 409 });
    profileId = current.account.id;
  }
  const body = await request.json().catch(() => null) as { handicap?: unknown } | null;
  const result = await acceptTournamentInvite(profileId, token, handicapFrom(body?.handicap));
  return result.ok ? NextResponse.json({ ok: true, id: result.id }) : NextResponse.json({ ok: false, message: result.message }, { status: 400 });
}
