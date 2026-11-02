import { NextResponse } from "next/server";
import { canPublish } from "@/lib/content/ribbon";
import { contentViewer, hashToken, LINK_DAYS, loadItems, loadTeam, newInviteToken } from "@/lib/content/ribbonServer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Admins only. `{ who }` invites an account by username or email; `{ link: true }` makes a one-time invite link. */
export async function POST(request: Request) {
  const viewer = await contentViewer(request);
  if (!viewer.profileId) return NextResponse.json({ ok: false, error: "Log in first." }, { status: 401 });
  if (!canPublish(viewer)) return NextResponse.json({ ok: false, error: "Only an Admin can invite Posters." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const service = createSupabaseServiceRoleClient();
  try {
    if (body?.link === true) {
      const token = newInviteToken();
      const expires = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
      const { error } = await service.from("content_team").insert({ invite_token_hash: hashToken(token), expires_at: expires, invited_by: viewer.profileId });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, link: `${new URL(request.url).origin}/join-team/${token}` });
    }
    const who = typeof body?.who === "string" ? body.who.trim().replace(/^@/, "") : "";
    if (!who) return NextResponse.json({ ok: false, error: "Type their username or email." }, { status: 400 });
    // Exact match only: escape the characters ilike treats as wildcards.
    const exact = who.replace(/[\\%_]/g, "\\$&");
    const { data: person, error: findError } = await service.from("profiles").select("id, platform_role").ilike(who.includes("@") ? "email" : "username", exact).maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!person) return NextResponse.json({ ok: false, error: "No account has that username or email. Use an invite link instead." }, { status: 404 });
    if (person.platform_role === "admin") return NextResponse.json({ ok: false, error: "That person is already an Admin." }, { status: 409 });
    const { data: existing, error: rowError } = await service.from("content_team").select("status").eq("profile_id", person.id).maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (existing && existing.status !== "removed") return NextResponse.json({ ok: false, error: "They're already on the team or invited." }, { status: 409 });
    const { error } = await service.from("content_team").upsert({ profile_id: person.id, status: "invited", invited_by: viewer.profileId, invited_at: new Date().toISOString(), accepted_at: null, removed_by: null, removed_at: null }, { onConflict: "profile_id" });
    if (error) throw new Error(error.message);
    const team = await loadTeam(await loadItems(viewer));
    return NextResponse.json({ ok: true, team });
  } catch (error) {
    console.error("content/team: invite failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't send that invite. Try again." }, { status: 500 });
  }
}
