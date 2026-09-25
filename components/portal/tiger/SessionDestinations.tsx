"use client";

import { useEffect, useState } from "react";
import type { LiveSessionState } from "@/lib/live/types";

export interface DestinationContext {
  activeYear: number;
  timezone: string;
  leaderboardOpen: boolean;
  upcomingYear: number;
  broadcastSession: number | null;
  matches: { round: number; tee_time: string; started: boolean; state: string }[];
  archiveSessions: number[];
  unavailable: boolean;
}

export function SessionDestinations({ session, year, context }: { session: LiveSessionState; year: number; context: DestinationContext }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);
  const active = year === context.activeYear;
  const matches = context.matches.filter(match => match.round === session.session);
  const locked = session.courseLocked && session.matchupsLocked;
  const schedule = active && session.courseLocked && Boolean(session.date || session.courseId || session.format);
  const scoring = active && locked && session.started && matches.some(match => match.started && match.state !== "Final" && now !== null && Date.parse(match.tee_time) <= now);
  const times = matches.filter(match => match.state !== "Final").map(match => Date.parse(match.tee_time)).filter(Number.isFinite);
  const first = times.length ? new Date(Math.min(...times)).toLocaleString("en-US", { timeZone: context.timezone, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "the assigned match tee time";
  const rows = [
    { name: "Home - upcoming schedule", live: schedule, detail: "When no live match replaces the home schedule card, chosen date, course and format show while this season is active and the session is locked. Blank details remain pending; tee times are not displayed here." },
    { name: "Schedule - session details", live: schedule, detail: "Uses the active season's locked details on the upcoming schedule. The landing page dates and venue are separate static content. Remains until unlocked or the active season changes." },
    { name: "Player portal - My Matches", live: active && locked && matches.length > 0, detail: "Appears for assigned players once course and matchups are locked in the active season. Upcoming, live and past cards follow each match's state." },
    { name: "Live scoring", live: scoring, detail: "Opens for each assigned player after both locks, Start Round and their match tee time (earliest: " + first + "). Shows their first unfinished session; ends when their match is final." },
    { name: "Career - round archive", live: context.archiveSessions.includes(session.session), detail: "Published when matchups are locked with a course and format before play. Saved rounds remain in career history after the session ends." },
    { name: "Leaderboard - match pages", live: active && context.leaderboardOpen && matches.length > 0, detail: "The upcoming leaderboard opens January 1, " + context.upcomingYear + ", using the active season's match boxes and official results. Before then it redirects to the last completed edition. Match pages and final results remain available afterward." },
    { name: "Broadcast - Watch Live", live: context.broadcastSession === session.session, detail: "Controlled by Broadcast Controls' display year and scene. Match play shows the latest live session, then the latest fully finished session until another takes over. Visibility lasts while this session is selected in the match-play scene; video takeovers temporarily replace it." },
    { name: "Wagers - tournament pricing", live: false, detail: "Course, format and locked matchups feed pricing calculations. Market publication and betting windows are controlled separately; locking this session does not open a market." },
  ];
  return <aside className="rounded-lg border border-stone-300 bg-stone-50 p-3" aria-label={"Where Session " + session.session + " shows"}>
    <h2 className="font-sans text-sm font-semibold">Where it shows</h2>
    <p className="mt-1 text-xs text-ink-500">Green = showing from saved data. Other destinations list their conditions. Refresh to recheck changes made elsewhere.</p>
    {!active && <p className="mt-2 text-xs text-amber-800">Active season: {context.activeYear}. This year&apos;s setup is saved for later activation.</p>}
    {context.unavailable && <p className="mt-2 text-xs text-red-700">Some destination data could not be checked. Refresh to try again.</p>}
    <ul className="mt-3 space-y-2">{rows.map(row => <li key={row.name} className={"rounded-md border p-2 " + (row.live ? "border-green-600 bg-green-50 text-green-900" : "border-stone-200 bg-white text-ink-700")}>
      <p className="text-xs font-semibold">{row.name} - {row.live ? "Showing" : "Conditional"}</p>
      <p className="mt-1 text-xs leading-relaxed">{row.detail}</p>
    </li>)}</ul>
  </aside>;
}
