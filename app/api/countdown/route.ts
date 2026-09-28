import { NextResponse } from "next/server";
import { getTournamentCountdown, getWatchCountdown } from "@/lib/countdownServer";

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get("source");
  try {
    const target = source === "watch-live" ? await getWatchCountdown() : await getTournamentCountdown();
    return NextResponse.json({ target }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Countdown unavailable." }, { status: 503 });
  }
}
