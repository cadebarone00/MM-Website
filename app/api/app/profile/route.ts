import { NextResponse } from "next/server";
import { loadContentTeam, loadDeleteAccount, loadEditProfile, loadFindGolfers, loadFriends, loadMyProfileScreen, loadPublicProfile, loadSettings } from "@/lib/profile/profileScreensData";

const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" };

/**
 * The iPhone / Android app's Profile screens (project_specs.md "The Maroon as a real iPhone app"): the same data the
 * website's profile pages load, for whoever is signed in. ?view=profile (default), edit, settings, search (Find golfers),
 * friends, user&username=… (someone's profile), delete (Delete account) or content-team.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "profile";
  try {
    const data = view === "settings" ? await loadSettings() : view === "edit" ? await loadEditProfile()
      : view === "search" ? await loadFindGolfers() : view === "friends" ? await loadFriends()
      : view === "user" ? await loadPublicProfile(url.searchParams.get("username") ?? "")
      : view === "delete" ? await loadDeleteAccount() : view === "content-team" ? await loadContentTeam()
      : await loadMyProfileScreen();
    return NextResponse.json({ ok: true, data }, { headers });
  } catch (error) {
    console.error("App profile data failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Couldn't load your profile. Try again." }, { status: 503, headers });
  }
}
