import { NextResponse } from "next/server";
import { requireHost } from "@/lib/portal/requireHost";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getActiveSeasonYear } from "@/lib/live/activeSeason";

const MAX_TEXT_LENGTH = 120;
const MIN_DURATION_SECONDS = 3;
const MAX_DURATION_SECONDS = 60;

/**
 * Host-triggered announcement overlay — a single manual "moment" banner
 * (spec §18), shown over whatever scene is currently on screen. Posting a
 * new one replaces whatever was showing; there's no queue of these yet
 * (only one overlay at a time makes sense until real events exist to queue
 * alongside it — see the spec's §12 note on this being deferred).
 */
export async function POST(request: Request) {
  const host = await requireHost();
  if (!host) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  const body = await request.json();
  const seasonYear = await getActiveSeasonYear();
  const service = createSupabaseServiceRoleClient();

  if (body.clear === true) {
    const { error } = await service
      .from("broadcast_state")
      .upsert({ season_year: seasonYear, overlay_text: null, overlay_expires_at: null, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ ok: false, error: "Could not clear the announcement." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const durationSeconds = Number(body.durationSeconds);
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ ok: false, error: `Announcement must be 1-${MAX_TEXT_LENGTH} characters.` }, { status: 400 });
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < MIN_DURATION_SECONDS || durationSeconds > MAX_DURATION_SECONDS) {
    return NextResponse.json({ ok: false, error: `Duration must be ${MIN_DURATION_SECONDS}-${MAX_DURATION_SECONDS} seconds.` }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  const { error } = await service
    .from("broadcast_state")
    .upsert({ season_year: seasonYear, overlay_text: text, overlay_expires_at: expiresAt, updated_at: new Date().toISOString() });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not post the announcement." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
