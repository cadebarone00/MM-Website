import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseActivityFeed, validateAnnouncement } from "@/lib/platform/activity";
import { resolveManagedEdition } from "@/lib/platform/dashboardServer";

type Params = { params: Promise<{ tournament: string; year: string }> };

/**
 * Post a commissioner announcement (plain text, everyone or players only).
 * Only the tournament's owner/organizers and platform admins; checked here
 * and again inside post_commissioner_announcement. Returns the updated feed.
 */
export async function POST(request: Request, { params }: Params) {
  const { tournament, year } = await params;
  const edition = await resolveManagedEdition(tournament, year);
  if (!edition) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const checked = validateAnnouncement(body);
  if (!checked.ok) return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });

  const { data, error } = await createSupabaseServiceRoleClient().rpc("post_commissioner_announcement", {
    p_profile: edition.profileId, p_edition: edition.editionId, p_title: checked.data.title, p_body: checked.data.body, p_visibility: checked.data.visibility,
  });
  if (error) {
    if (error.code === "42501" && /Admin Center/.test(error.message ?? "")) return NextResponse.json({ ok: false, error: "The Maroon Tournament is managed in the Admin Center." }, { status: 403 });
    if (error.code === "42501") return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    if (error.code === "22023") return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (error.code === "PGRST202") return NextResponse.json({ ok: false, error: "Announcements aren't switched on yet." }, { status: 503 });
    console.error("post_commissioner_announcement failed:", error.message);
    return NextResponse.json({ ok: false, error: "Could not post the announcement. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...parseActivityFeed(data) }, { status: 201 });
}
