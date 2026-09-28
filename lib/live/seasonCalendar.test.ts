import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { calendarDate, resolveSeasonCalendar, validCalendarDate, upcomingSeasonYear, seasonYearStatus } from "./seasonCalendar.ts";
import { overviewDays, overviewMatchCount, type OverviewYear } from "./seasonOverview.ts";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs.ts";
import { roundFormatArchive } from "@/lib/data/roundFormatArchive.ts";

test("Upcoming opens the day after the active event ends without changing Active", () => {
  assert.equal(upcomingSeasonYear(2026, "2026-01-10", "2026-01-10"), null);
  assert.equal(upcomingSeasonYear(2026, "2026-01-10", "2026-01-11"), 2027);
  assert.equal(upcomingSeasonYear(2026, "2026-01-10", "2026-09-28"), 2027);
  assert.equal(upcomingSeasonYear(2027, null, "2027-01-11"), null);
  assert.equal(upcomingSeasonYear(2033, "2033-01-10", "2033-01-11"), null);
  assert.deepEqual([2024, 2025, 2026, 2027, 2028, 2034].map(year => seasonYearStatus(year, 2026, 2027, [2024, 2025])), ["Archived", "Archived", "Active", "Upcoming", "Future", "Test season"]);
});

test("handoff selects the successor at Central midnight and archives only the outgoing year", () => {
  const window={year:2027,activeOn:"2026-09-01",passOn:"2027-09-01",locked:true};
  assert.equal(calendarDate(new Date("2027-09-01T04:59:59Z")),"2027-08-31");
  assert.equal(calendarDate(new Date("2027-09-01T05:00:00Z")),"2027-09-01");
  assert.equal(resolveSeasonCalendar([window],2027,"2027-08-31").activeYear,2027);
  assert.equal(resolveSeasonCalendar([window],2027,"2026-08-31").activeYear,2026);
  const next=resolveSeasonCalendar([window],2027,"2027-09-01");
  assert.equal(next.activeYear,2028); assert.ok(next.archivedYears.includes(2027));
  assert.equal(resolveSeasonCalendar([{...window,locked:false}],2027,"2027-09-01").activeYear,2027);
  assert.equal(resolveSeasonCalendar([{...window,year:2034}],2027,"2027-01-01").activeYear,2027);
  assert.equal(validCalendarDate("2027-02-29"),false);assert.equal(validCalendarDate("2028-02-29"),true);
});

test("2026 remains live data until its own pass-on or archive timestamp", () => {
  const current=resolveSeasonCalendar([
    {year:2026,activeOn:"2026-01-01",passOn:"2027-01-01",locked:true},
    {year:2027,activeOn:"2027-01-01",passOn:"2028-01-01",locked:true},
  ],2027,"2026-12-31");
  assert.equal(current.activeYear,2026);
  assert.deepEqual(current.archivedYears,[2024,2025]);
  const passed=resolveSeasonCalendar([
    {year:2026,activeOn:"2026-01-01",passOn:"2027-01-01",locked:true},
    {year:2027,activeOn:"2027-01-01",passOn:"2028-01-01",locked:true},
  ],2027,"2027-01-01");
  assert.equal(passed.activeYear,2027);
  assert.ok(passed.archivedYears.includes(2026));
  const manuallyArchived=resolveSeasonCalendar([{year:2026,activeOn:null,passOn:null,locked:false,archivedAt:"2027-01-01T06:00:00Z"}],2027,"2026-12-31");
  assert.ok(manuallyArchived.archivedYears.includes(2026));
});

test("overview includes all tournament days and preserves undated sessions",()=>{
  const year={beginDate:"2027-01-06",endDate:"2027-01-09",sessions:[{number:1,date:"2027-01-06"},{number:2,date:null}]} as OverviewYear;
  const days=overviewDays(year); assert.equal(days.length,5);assert.equal(days[4].date,null);
  assert.equal(overviewMatchCount("Singles"),6);assert.equal(overviewMatchCount("Fourball"),3);assert.equal(overviewMatchCount(null),0);
});

test("2026 checked-in tournament data is four days and eight sessions", () => {
  assert.equal(palmSprings2026.startDate, "2026-01-07");
  assert.equal(palmSprings2026.endDate, "2026-01-10");
  const sessions = roundFormatArchive(palmSprings2026);
  assert.equal(sessions.length, 8);
  const days = overviewDays({
    beginDate: palmSprings2026.startDate,
    endDate: palmSprings2026.endDate,
    sessions: sessions.map((session) => ({ number: session.round, date: palmSprings2026.dayDates?.[session.day] ?? null })),
  } as OverviewYear);
  assert.equal(days.length, 4);
  assert.deepEqual(days.map((day) => day.sessions.length), [2, 2, 2, 2]);
});

test("database calendar shares dates, protects locks, rejects overlaps and retains scores at handoff",async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role service_role; create table live_active_season(id boolean primary key,season_year integer constraint live_active_season_season_year_check check(season_year between 2027 and 2034));insert into live_active_season values(true,2027);create table live_tournament_settings(season_year integer primary key,completed_at timestamptz);insert into live_tournament_settings values(2027,null);create table scores(score integer);insert into scores values(4);");
    const migration=readFileSync("supabase/season_calendar.sql","utf8");await db.exec(migration);await db.exec(migration);
    await db.exec("select save_season_calendar(2027,'2025-01-01','2025-09-01',true)");
    const adjacent=await db.query("select active_on::text from season_calendar where season_year=2028");assert.equal((adjacent.rows[0] as {active_on:string}).active_on,"2025-09-01");
    await assert.rejects(db.exec("select save_season_calendar(2027,'2025-01-02','2025-09-01',false)"),/Unlock/);
    await assert.rejects(db.exec("select save_season_calendar(2028,'2025-09-02','2026-09-01',true)"),/adjacent/);
    await db.exec("select sync_season_calendar()");
    assert.deepEqual((await db.query("select season_year from live_active_season")).rows,[{season_year:2028}]);
    assert.deepEqual((await db.query("select score from scores")).rows,[{score:4}]);
    assert.equal(((await db.query<{ archived: boolean }>("select archived_at is not null as archived from season_calendar where season_year=2027")).rows[0] as { archived: boolean }).archived,true);
    await db.exec("select save_season_calendar(2027,'2025-01-01','2025-09-01',false)");
    assert.equal(((await db.query("select archived_at is not null as archived from season_calendar where season_year=2027")).rows[0] as { archived: boolean }).archived,true);
    await assert.rejects(db.exec("select save_season_calendar(2034,'2033-09-01','2034-09-01',true)"),/test season/);
  }finally{await db.close();}
});
