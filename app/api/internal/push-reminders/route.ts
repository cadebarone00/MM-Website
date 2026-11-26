import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runReminders } from "@/lib/notifications/remindersServer";

/**
 * GET — the 5-minute timer (Supabase Cron, project_specs.md "Expo app Step 6", part 6c) sends what's due: "Tee time in
 * 30 minutes" and "The draft starts in 15 minutes". Needs `Authorization: Bearer <CRON_SECRET>` (the same secret as the
 * other timers); anything else is refused. Each reminder goes out once (push_reminders_sent).
 */
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

function allowed(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${expected}`);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

export async function GET(request: Request) {
  if (!allowed(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers });
  const result = await runReminders();
  if (result.status === "not_installed") return NextResponse.json({ ok: false, code: "not_installed", error: "Run supabase/push_reminders.sql first." }, { status: 503, headers });
  if (result.status === "failed") return NextResponse.json({ ok: false, error: "Reminders failed this time." }, { status: 500, headers });
  return NextResponse.json({ ok: true, trips: result.trips, sent: result.sent }, { headers });
}
