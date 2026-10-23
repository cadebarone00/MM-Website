import { NextResponse } from "next/server";
import { loadWatch } from "@/lib/platform/watchServer";

/** GET: what a watch code shows (read only, no sign-in): a tournament or a trip, stripped of anything private. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^W[A-Z0-9]{5}$/i.test(code.replace(/[^A-Za-z0-9]/g, ""))) return NextResponse.json({ ok: false, code: "missing" }, { status: 404, headers });
  const load = await loadWatch(code);
  if (load.status === "ok") return NextResponse.json({ ok: true, ...load.view }, { headers });
  const status = load.status === "missing" ? 404 : load.status === "not_installed" ? 503 : 500;
  return NextResponse.json({ ok: false, code: load.status }, { status, headers });
}
