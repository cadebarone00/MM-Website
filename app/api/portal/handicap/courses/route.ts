import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getCourseLibraryForHandicap } from "@/lib/handicap/data";

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  try {
    const courses = await getCourseLibraryForHandicap();
    return NextResponse.json({ ok: true, courses }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load the course library." }, { status: 500 });
  }
}
