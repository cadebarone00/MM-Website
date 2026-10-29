import { NextResponse } from "next/server";
import { getCurrentProfileForRequest } from "@/lib/profile/currentProfile";
import { loadTapInDisplay } from "@/lib/tap-in/display";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const current = await getCurrentProfileForRequest(request);
    if (current.status === "signed-out") return NextResponse.json({ error: "Sign in to use Tap In." }, { status: 401, headers });
    if (current.status !== "ok") return NextResponse.json({ error: "Complete your profile first." }, { status: 403, headers });
    return NextResponse.json(await loadTapInDisplay(), { headers });
  } catch {
    return NextResponse.json({ error: "Could not refresh the display." }, { status: 503, headers });
  }
}
