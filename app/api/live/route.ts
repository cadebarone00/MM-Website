import { NextResponse } from "next/server";
import { loadLiveDirectory } from "@/lib/platform/liveDirectoryServer";

/** GET ?q=words: The Maroon Live directory (no sign-in). Public trips and tournaments, golf details only. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const load = await loadLiveDirectory(query);
  if (load.status === "ok") return NextResponse.json({ ok: true, events: load.events }, { headers: { "Cache-Control": "public, max-age=15, s-maxage=15" } });
  return NextResponse.json({ ok: false, code: load.status }, { status: load.status === "not_installed" ? 503 : 500, headers: { "Cache-Control": "no-store" } });
}
