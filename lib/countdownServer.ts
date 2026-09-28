import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getWebsiteSettings } from "@/lib/website/settingsServer";
import { resolveDisplayYear } from "@/lib/website/settings";
import { getSeasonCalendar } from "@/lib/live/seasonCalendarServer";
import { nextTournament } from "@/lib/data";
import { deriveMatchTeeTime } from "@/lib/live/sessionTeeTimes";
import type { CountdownTarget, WatchCountdownSettings } from "./countdown";

export async function getTournamentCountdown(): Promise<CountdownTarget> {
  const [{ settings }, calendar] = await Promise.all([getWebsiteSettings(), getSeasonCalendar()]);
  const year = resolveDisplayYear(settings.home, calendar, nextTournament.year);
  const service = createSupabaseServiceRoleClient();
  const [session, tournament] = await Promise.all([
    service.from("live_round_state").select("date, match_tee_times, course_locked").eq("season_year", year).eq("round", 1).maybeSingle(),
    service.from("live_tournament_settings").select("timezone").eq("season_year", year).maybeSingle(),
  ]);
  if (session.error || tournament.error) throw new Error("Could not load the first tee time.");
  const timezone = tournament.data?.timezone ?? "America/Los_Angeles";
  const start = session.data?.course_locked
    ? deriveMatchTeeTime(session.data.date, session.data.match_tee_times?.[0] ?? null, timezone)
    : null;
  return { title: `${year} Session 1, Match 1`, targetAt: start?.toISOString() ?? null, timezone };
}

export async function getWatchCountdown(): Promise<WatchCountdownSettings | null> {
  const { data, error } = await createSupabaseServiceRoleClient().from("broadcast_countdown")
    .select("title, event_date, event_time, timezone, target_at").eq("id", true).maybeSingle();
  if (error) throw new Error("Watch Live countdown is unavailable. Apply the broadcast_countdown migration.");
  return data ? { title: data.title, date: data.event_date, time: data.event_time.slice(0, 5), timezone: data.timezone, targetAt: data.target_at } : null;
}
