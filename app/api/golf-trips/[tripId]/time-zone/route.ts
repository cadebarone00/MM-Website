import { NextResponse } from "next/server";
import { getGolfTrip } from "@/lib/platform/golfTripsServer";
import { isTripTimeZone } from "@/lib/platform/tripTimeZones";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * The trip's time zone (project_specs.md "Expo app Step 6", part 6c; supabase/push_reminders.sql).
 *   GET                 any member: { timeZone: string | null } (null = not picked, Central is used)
 *   PUT { timeZone }    the organizer picks one from lib/platform/tripTimeZones.ts
 */
const headers = { "Cache-Control": "no-store" };
const MISSING = new Set(["42703", "PGRST204"]);

async function trip(tripId: string) {
  const view = await getGolfTrip(tripId);
  if (view.status !== "ok") return { error: NextResponse.json({ ok: false, error: view.status === "signed-out" ? "Log in first." : "Trip not found." }, { status: view.status === "signed-out" ? 401 : 404, headers }) };
  return { view };
}

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const loaded = await trip(tripId);
  if ("error" in loaded) return loaded.error;
  const { data, error } = await createSupabaseServiceRoleClient().from("golf_trips").select("time_zone").eq("id", tripId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, code: MISSING.has(error.code ?? "") ? "not_installed" : "failed", error: "Couldn't load the time zone." }, { status: MISSING.has(error.code ?? "") ? 503 : 500, headers });
  return NextResponse.json({ ok: true, timeZone: (data as { time_zone?: string | null } | null)?.time_zone ?? null }, { headers });
}

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const loaded = await trip(tripId);
  if ("error" in loaded) return loaded.error;
  if (!loaded.view.viewer.isOrganizer) return NextResponse.json({ ok: false, error: "Only the organizer can change the time zone." }, { status: 403, headers });
  const body = await request.json().catch(() => null) as { timeZone?: unknown } | null;
  if (!isTripTimeZone(body?.timeZone)) return NextResponse.json({ ok: false, error: "Pick one of the listed time zones." }, { status: 400, headers });
  const { error } = await createSupabaseServiceRoleClient().from("golf_trips").update({ time_zone: body.timeZone }).eq("id", tripId);
  if (error) return NextResponse.json({ ok: false, code: MISSING.has(error.code ?? "") ? "not_installed" : "failed",
    error: MISSING.has(error.code ?? "") ? "Trip time zones aren't switched on yet." : "Couldn't save the time zone. Try again." }, { status: MISSING.has(error.code ?? "") ? 503 : 500, headers });
  return NextResponse.json({ ok: true, timeZone: body.timeZone }, { headers });
}
