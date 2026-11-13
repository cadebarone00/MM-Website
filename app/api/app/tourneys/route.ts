import { NextResponse, type NextRequest } from "next/server";
import { loadMyAccess } from "@/lib/platform/accessRequestsServer";
import { loadMyPlaying, loadOrganizerHome, loadTourneysHome } from "@/lib/platform/tourneyScreensData";

/**
 * The app's Tourneys screens, loaded as the website's pages load them: ?view=join (Tourneys), mine (tournaments you're
 * playing in), organizer (the organizer studio's home); no view = your tournament-creator access (New tournament /
 * Request access).
 */
export async function GET(request: NextRequest) {
  const view = request.nextUrl.searchParams.get("view");
  try {
    const data = view === "join" ? await loadTourneysHome() : view === "mine" ? await loadMyPlaying() : view === "organizer" ? await loadOrganizerHome() : await loadMyAccess();
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't load your tournaments. Try again." }, { status: 503 });
  }
}
