import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSeasonCalendar } from "./seasonCalendarServer";
import { OVERVIEW_YEARS } from "./seasonCalendar";
import { TEST_SEASON_YEAR } from "./testSeason";
import { pastTournaments } from "@/lib/data";
import { roundFormatArchive } from "@/lib/data/roundFormatArchive";
import type { SeasonOverviewData, OverviewSession } from "./seasonOverview";

function dateRangeFromSessions(sessions: OverviewSession[]) {
  const dates = [...new Set(sessions.flatMap(session => session.date ? [session.date] : []))].sort();
  return { beginDate: dates[0] ?? null, endDate: dates.at(-1) ?? null };
}

export async function getSeasonOverview(): Promise<SeasonOverviewData> {
  const service = createSupabaseServiceRoleClient();
  const [calendar, settings, sessions, matches, courses, archiveSetups] = await Promise.all([
    getSeasonCalendar(),
    service.from("live_tournament_settings").select("season_year, timezone, begin_date, end_date, dates_locked, round_count, round_count_locked").in("season_year", OVERVIEW_YEARS),
    service.from("live_round_state").select("season_year, round, date, course_id, format, course_locked, matchups_locked, started, match_tee_times").in("season_year", OVERVIEW_YEARS).order("round"),
    service.from("live_match_boxes").select("season_year, round, box_number, tee_time, state, started, maroon_players, white_players").in("season_year", OVERVIEW_YEARS).order("box_number"),
    service.from("live_courses").select("id, name"),
    service.from("round_format_setups").select("season_year, round, played_on, course_name").eq("season_year", 2026),
  ]);
  if (settings.error || sessions.error || matches.error || courses.error) throw new Error("Could not load year setup. Check the session-count and tee-time migrations.");
  return { activeYear: calendar.activeYear, upcomingYear: calendar.upcomingYear, calendarAvailable: calendar.available, checkedAt: new Date().toISOString(), years: OVERVIEW_YEARS.map(year => {
    const setup = settings.data?.find(row => row.season_year === year);
    const window = calendar.windows.find(row => row.year === year) ?? { year, activeOn: null, passOn: null, locked: false };
    let rounds: OverviewSession[] = (sessions.data ?? []).filter(row => row.season_year === year).map(row => ({ number: row.round, date: row.date, course: courses.data?.find(course => course.id === row.course_id)?.name ?? null, format: row.format, courseLocked: row.course_locked, matchupsLocked: row.matchups_locked, started: row.started, teeTimes: row.match_tee_times ?? [null,null,null], matches: (matches.data ?? []).filter(match => match.season_year === year && match.round === row.round).map(match => ({ number: match.box_number, teeTime: match.tee_time, state: match.state, started: match.started, maroonPlayers: match.maroon_players ?? [], whitePlayers: match.white_players ?? [] })) }));
    const historical = pastTournaments.find(tournament => tournament.year === year);
    const checkedInData = Boolean(historical && !rounds.length);
    if (historical && !rounds.length) rounds = roundFormatArchive(historical).map(round => {
      const archived = archiveSetups.data?.find(setup => setup.round === round.round);
      return { number: round.round, date: archived?.played_on ?? historical.dayDates?.[round.day] ?? null, course: archived?.course_name ?? null, format: round.format, courseLocked: true, matchupsLocked: true, started: true, teeTimes: [null,null,null], matches: round.matchups.map((match,index) => ({ number: index+1, teeTime: null, state: "Final", started: true, maroonPlayers: match.side, whitePlayers: match.opponent })) };
    });
    const historicalRange = historical ? dateRangeFromSessions(rounds) : { beginDate: null, endDate: null };
    return { ...window, activeLockedByPrevious: calendar.windows.some(row=>row.year===year-1 && row.locked), passLockedByNext: calendar.windows.some(row=>row.year===year+1 && row.locked), timezone: setup?.timezone ?? "America/Los_Angeles", beginDate: setup?.begin_date ?? historicalRange.beginDate, endDate: setup?.end_date ?? historicalRange.endDate, datesLocked: setup?.dates_locked ?? checkedInData, count: setup?.round_count ?? (checkedInData ? rounds.length : null), countLocked: setup?.round_count_locked ?? checkedInData, sessions: rounds, checkedInData, historical: calendar.archivedYears.includes(year), test: year === TEST_SEASON_YEAR };
  }) };
}
