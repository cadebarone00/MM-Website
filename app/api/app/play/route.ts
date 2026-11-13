import { NextResponse } from "next/server";
import { loadPlayData } from "@/lib/content/playData";

/** The app's Play screen (project_specs.md "The Maroon as a real iPhone app"): the same data as the website's Play page. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, data: await loadPlayData() }, { headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't load Play. Try again." }, { status: 503 });
  }
}
