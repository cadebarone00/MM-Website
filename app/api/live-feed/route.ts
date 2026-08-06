import { NextResponse } from "next/server";
import { normalizePayload } from "@/lib/data/liveFeedNormalize";

export async function GET() {
  const url = process.env.LIVE_FEED_URL;

  if (!url) {
    return NextResponse.json({ error: "LIVE_FEED_URL is not configured yet." }, { status: 503 });
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `Live feed responded with ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(normalizePayload(data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not reach the live feed." }, { status: 502 });
  }
}
