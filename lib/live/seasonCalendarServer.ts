import { cache } from "react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveSeasonCalendar, type SeasonWindow } from "./seasonCalendar";

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
  return { ...resolveSeasonCalendar(windows, active.data?.season_year ?? 2027), available: !calendar.error && !sync.error, manualYear: active.data?.season_year ?? 2027 };
});
