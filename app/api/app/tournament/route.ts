import { NextResponse } from "next/server";
import { loadLatestPublicYear, loadNextYear, loadPlayTournament, loadPublicSite, loadSitePreview, loadStudio } from "@/lib/platform/tournamentScreensData";

const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" };

/**
 * The iPhone / Android app's tournament screens (project_specs.md "The Maroon iPhone app — Phase 2"): the same data the
 * website's pages load. ?kind=play | public | latest | preview | studio | next, &tournament=<slug>&year=<year>.
 * Organizer-only and private things answer "not found" for anyone else, exactly like the website's 404s.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "play";
  const slug = url.searchParams.get("tournament") ?? "", year = url.searchParams.get("year") ?? "";
  if (!slug) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers });
  try {
    const data = kind === "public" ? await loadPublicSite(slug, year) : kind === "latest" ? { year: await loadLatestPublicYear(slug) }
      : kind === "preview" ? await loadSitePreview(slug, year) : kind === "studio" ? await loadStudio(slug, year)
      : kind === "next" ? await loadNextYear(slug, year) : await loadPlayTournament(slug, year);
    if (data === null) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers });
    return NextResponse.json({ ok: true, data }, { headers });
  } catch (error) {
    console.error("App tournament data failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Couldn't load this tournament. Try again." }, { status: 503, headers });
  }
}
