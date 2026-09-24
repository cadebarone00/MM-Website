// app/portal/admin/master-settings/[year]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isValidSeasonYear, getActiveSeasonYear } from "@/lib/live/activeSeason";
import { MasterSettingsPanel } from "@/components/portal/tiger/MasterSettingsPanel";
import type { TournamentSettings } from "@/lib/live/types";

export default async function MasterSettingsPage({ params }: { params: Promise<{ year: string }> }) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  if (!isValidSeasonYear(year)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host").eq("id", user.id).single();
  if (!profile?.is_host) redirect("/");

  const service = createSupabaseServiceRoleClient();
  const [{ data: settingsRow }, activeYear] = await Promise.all([
    service
      .from("live_tournament_settings")
      .select("round_count, completed_at, venue_name, venue_locked, begin_date, end_date, dates_locked")
      .eq("season_year", year)
      .maybeSingle(),
    getActiveSeasonYear(),
  ]);

  const settings: TournamentSettings = {
    roundCount: settingsRow?.round_count ?? null,
    completedAt: settingsRow?.completed_at ?? null,
    venueName: settingsRow?.venue_name ?? null,
    venueLocked: settingsRow?.venue_locked ?? false,
    beginDate: settingsRow?.begin_date ?? null,
    endDate: settingsRow?.end_date ?? null,
    datesLocked: settingsRow?.dates_locked ?? false,
  };
  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-7">
      <h1 className="font-serif text-2xl font-bold text-ink-900">{year} Master Settings</h1>
      <MasterSettingsPanel year={year} initialSettings={settings} isActiveYear={activeYear === year} />
    </div>
  );
}
