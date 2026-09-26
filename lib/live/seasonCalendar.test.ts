import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { calendarDate, resolveSeasonCalendar, validCalendarDate } from "./seasonCalendar.ts";
import { overviewDays, overviewMatchCount, type OverviewYear } from "./seasonOverview.ts";

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

test("overview includes all tournament days and preserves undated sessions",()=>{
  const year={beginDate:"2027-01-06",endDate:"2027-01-09",sessions:[{number:1,date:"2027-01-06"},{number:2,date:null}]} as OverviewYear;
  const days=overviewDays(year); assert.equal(days.length,5);assert.equal(days[4].date,null);
  assert.equal(overviewMatchCount("Singles"),6);assert.equal(overviewMatchCount("Fourball"),3);assert.equal(overviewMatchCount(null),0);
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
