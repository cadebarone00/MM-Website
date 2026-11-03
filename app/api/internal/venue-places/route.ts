import { timingSafeEqual } from "node:crypto";
import { refreshUpcomingAreas } from "@/lib/platform/venuePlacesServer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Venue places daily job (Vercel Cron, vercel.json): looks up upcoming trips' areas on OpenStreetMap ahead of time
 * (lib/platform/venuePlacesServer.ts refreshUpcomingAreas). Only the cron secret can run it (same check as
 * /api/internal/account-deletions). Answers counts only.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${expected ?? ""}`);
  if (!expected || supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await refreshUpcomingAreas()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Venue places job:", (error as Error).message.slice(0, 160));
    return Response.json({ ok: false }, { status: 500 });
  }
}
