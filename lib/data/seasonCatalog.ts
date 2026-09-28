import { cache } from "react";
import { pastTournaments, nextTournament, isPastLeaderboardSwitchover } from "./index";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSeasonCalendar } from "@/lib/live/seasonCalendarServer";
import { buildLiveTournamentSnapshot } from "@/lib/broadcast/liveSnapshot";
import { playerProfilePayload } from "@/lib/live/playerProfile";
import type { Tournament, UpcomingTournament } from "./types";
import { SEASON_YEARS } from "@/lib/live/seasonYears";
import { getRequestWebsiteSection, getWebsiteSettings } from "@/lib/website/settingsServer";
import type { WebsiteSection } from "@/lib/website/settings";

export function seasonSlug(year: number) { return pastTournaments.find(row => row.year === year)?.slug ?? (year === nextTournament.year ? nextTournament.slug : year + "-maroon-masters"); }
export function nativeSeasonYear(slug: string): number | null { return SEASON_YEARS.find(year => seasonSlug(year) === slug) ?? null; }

export const getSeasonTournament = cache(async (year: number): Promise<Tournament> => {
  const historical = pastTournaments.find(row => row.year === year);
  if (historical) return historical;
  const service = createSupabaseServiceRoleClient();
  const [settings, snapshot, roundRows] = await Promise.all([
    service.from("live_tournament_settings").select("venue_name, venue_locked, begin_date, end_date, dates_locked").eq("season_year",year).maybeSingle(),
    buildLiveTournamentSnapshot(year,{confirmedOnly:true}),
    service.from("live_round_state").select("round, date").eq("season_year",year).order("round"),
  ]);
  const payload = playerProfilePayload(snapshot, Object.keys(snapshot.players)[0] ?? "");
  const dates = [...new Set((roundRows.data ?? []).flatMap(row => row.date ? [row.date as string] : []))].sort();
  const matches = (payload.matches ?? []).map(match => {
    const round = roundRows.data?.find(row => row.round === match.day);
    const dayRounds = roundRows.data?.filter(row => row.date === round?.date) ?? [];
    return { ...match, day: round?.date ? dates.indexOf(round.date)+1 : match.day, session: dayRounds[0]?.round === round?.round ? "Morning" as const : "Afternoon" as const };
  });
  const scorecards = Object.keys(snapshot.players).flatMap(player => playerProfilePayload(snapshot,player).scorecards ?? []);
  const startDate = settings.data?.dates_locked ? settings.data.begin_date ?? "" : "";
  const endDate = settings.data?.dates_locked ? settings.data.end_date ?? "" : "";
  const standings=payload.individualLeaderboard ?? [];
  const winner=matches.length && matches.every(match=>match.status === "final") && standings.length && (standings.length===1 || standings[0].toPar < standings[1].toPar) ? standings[0].player : undefined;
  return { dayDates: Object.fromEntries(dates.map((date,index)=>[index+1,date])), individualChampion: winner, slug: seasonSlug(year), year, editionLabel: "Maroon Masters " + year, venue: settings.data?.venue_locked ? settings.data.venue_name ?? "Venue pending" : "Venue pending", location: "", dateLabel: startDate && endDate ? startDate + " - " + endDate : "Dates pending", startDate, endDate, roster: payload.roster ?? {maroon:[],white:[]}, matches, scorecards, individualLeaderboard: payload.individualLeaderboard ?? [], maroonPts: matches.reduce((sum,row)=>sum+row.maroonPts,0), whitePts: matches.reduce((sum,row)=>sum+row.whitePts,0), pointsAvailable: matches.length, pointsToWin: Math.floor(matches.length/2)+1 };
});

export const getSeasonCatalog = cache(async (requestedSection?: WebsiteSection) => {
  const section = requestedSection ?? await getRequestWebsiteSection();
  const { settings: websiteSettings } = await getWebsiteSettings();
  const selectedYear = websiteSettings[section];
  const calendar = await getSeasonCalendar();
  const year = selectedYear ?? (calendar.scheduled ? calendar.activeYear : nextTournament.year);
  const service = createSupabaseServiceRoleClient();
  const { data: settings } = await service.from("live_tournament_settings").select("venue_name, venue_locked, begin_date, end_date, dates_locked").eq("season_year",year).maybeSingle();
  const historical = pastTournaments.find(row => row.year === year);
  const base = historical ? { ...historical, liveAt: historical.startDate + "T00:00:00" } : year === nextTournament.year ? nextTournament : { ...nextTournament, year, slug: seasonSlug(year), editionLabel: "Maroon Masters " + year, venue: "Venue pending", location: "", dateLabel: "Dates pending", startDate: "", endDate: "", liveAt: "" };
  const current: UpcomingTournament = { ...base, venue: settings?.venue_locked && settings.venue_name ? settings.venue_name : base.venue, startDate: settings?.dates_locked && settings.begin_date ? settings.begin_date : base.startDate, endDate: settings?.dates_locked && settings.end_date ? settings.end_date : base.endDate };
  if (settings?.dates_locked) current.liveAt = current.startDate ? current.startDate + "T00:00:00" : "";
  if (settings?.dates_locked && settings.begin_date && settings.end_date) current.dateLabel = settings.begin_date + " - " + settings.end_date;
  const archives = await Promise.all(calendar.archivedYears.filter(year => year !== 2034).map(getSeasonTournament));
  const featured = calendar.scheduled || selectedYear !== null ? await getSeasonTournament(year) : null;
  const completed = featured && featured.matches.length > 0 && featured.matches.every(match => match.status === "final" || (historical && !match.status)) ? featured : archives.at(-1) ?? pastTournaments[0];
  return { section, selectedYear, nextTournament: current, pastTournaments: archives, latestCompleted: completed, scheduled: calendar.scheduled || selectedYear !== null, leaderboardOpen: selectedYear !== null || calendar.scheduled || isPastLeaderboardSwitchover() };
});

export async function getCatalogTournament(slug: string) {
  const historical = pastTournaments.find(row=>row.slug===slug);
  if (historical) return historical;
  const year=nativeSeasonYear(slug);
  if (!year) return undefined;
  return getSeasonTournament(year);
}
