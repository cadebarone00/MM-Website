import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSeasonCalendar } from "@/lib/live/seasonCalendarServer";
import { deriveMatchTeeTime } from "@/lib/live/sessionTeeTimes";
import type { CountdownTarget, WatchCountdownSettings } from "./countdown";

export async function getTournamentCountdown(): Promise<CountdownTarget> {
  const calendar = await getSeasonCalendar();
  const year = calendar.upcomingYear ?? calendar.activeYear;
  const service = createSupabaseServiceRoleClient();
  const [session, tournament, match] = await Promise.all([
    service.from("live_round_state").select("date, match_tee_times").eq("season_year", year).eq("round", 1).maybeSingle(),
    service.from("live_tournament_settings").select("timezone").eq("season_year", year).maybeSingle(),
    service.from("live_match_boxes").select("tee_time").eq("season_year", year).eq("round", 1).eq("box_number", 1).maybeSingle(),
  ]);
  if (session.error || tournament.error || match.error) throw new Error("Could not load the first tee time.");
  const timezone = tournament.data?.timezone ?? "America/Los_Angeles";
  const matchTime = match.data?.tee_time ? new Date(match.data.tee_time) : null;
  const savedTime = session.data?.match_tee_times?.[0] ?? (matchTime && Number.isFinite(matchTime.getTime())
    ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(matchTime) : null);
  const start = deriveMatchTeeTime(session.data?.date ?? null, savedTime, timezone);
  return { title: `${year} Session 1, Match 1`, targetAt: start?.toISOString() ?? null, timezone };
}

export async function getWatchCountdown(): Promise<WatchCountdownSettings | null> {
  const { data, error } = await createSupabaseServiceRoleClient().from("broadcast_countdown")
    .select("title, event_date, event_time, timezone, target_at").eq("id", true).maybeSingle();
  if (error) throw new Error("Watch Live countdown is unavailable. Apply the broadcast_countdown migration.");
  return data ? { title: data.title, date: data.event_date, time: data.event_time.slice(0, 5), timezone: data.timezone, targetAt: data.target_at } : null;
}
