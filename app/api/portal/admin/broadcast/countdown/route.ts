import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseWatchCountdown } from "@/lib/countdown";

export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const settings = parseWatchCountdown(body);
  if (!settings) return NextResponse.json({ error: "Enter an event name (up to 120 characters), a valid date and time, and a time zone. Daylight-saving skipped times cannot be used." }, { status: 400 });
  const { error } = await createSupabaseServiceRoleClient().from("broadcast_countdown").upsert({
    id: true, title: settings.title, event_date: settings.date, event_time: settings.time,
    timezone: settings.timezone, target_at: settings.targetAt, updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "Could not save the countdown. Check that the broadcast_countdown migration is installed." }, { status: 500 });
  return NextResponse.json({ target: settings });
}
