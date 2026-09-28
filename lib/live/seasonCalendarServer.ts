import { cache } from "react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveSeasonCalendar, upcomingSeasonYear, type SeasonWindow } from "./seasonCalendar";
import { pastTournaments } from "@/lib/data";

export const getSeasonCalendar = cache(async () => {
  const service = createSupabaseServiceRoleClient();
  const sync = await service.rpc("sync_season_calendar");
  if (sync.error && !["42883", "PGRST202"].includes(sync.error.code)) {
    console.warn("Could not synchronize season calendar.", sync.error);
  }
  const [calendar, active] = await Promise.all([
    service.from("season_calendar").select("season_year, active_on, pass_on, locked, archived_at").order("season_year"),
    service.from("live_active_season").select("season_year").eq("id", true).maybeSingle(),
  ]);
  if (calendar.error && !["42P01", "PGRST205"].includes(calendar.error.code)) {
    console.warn("Could not read season calendar.", calendar.error);
  }
  const windows: SeasonWindow[] = (sync.error || calendar.error ? [] : calendar.data ?? []).map(row => ({ year: row.season_year, activeOn: row.active_on, passOn: row.pass_on, locked: row.locked, archivedAt: row.archived_at }));
  const resolved = resolveSeasonCalendar(windows, active.data?.season_year ?? 2027);
  const { data: tournament, error: tournamentError } = await service.from("live_tournament_settings")
    .select("end_date, timezone").eq("season_year", resolved.activeYear).maybeSingle();
  if (tournamentError) console.warn("Could not read the active tournament end date.");
  const endDate = tournament?.end_date ?? pastTournaments.find(row => row.year === resolved.activeYear)?.endDate ?? null;
  const timezone = tournament?.timezone ?? "America/Los_Angeles";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcomingYear = upcomingSeasonYear(resolved.activeYear, endDate, today);
  return { ...resolved, upcomingYear, available: !calendar.error && !sync.error, manualYear: active.data?.season_year ?? 2027 };
});
