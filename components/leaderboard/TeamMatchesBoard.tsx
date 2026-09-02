"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { CompactMatchRow } from "./CompactMatchRow";
import { centralDateLabel, currentRoundDay, LIVE_START_LABEL } from "./matchUtils";
import { fmtPt } from "@/lib/data";
import type { RealMatch, Tournament } from "@/lib/data/types";

type SessionGroup = { session: string; format: string; matches: RealMatch[] };

function groupBySession(matches: RealMatch[]): SessionGroup[] {
  const order: string[] = [];
  const bySession = new Map<string, RealMatch[]>();
  matches.forEach((m) => {
    if (!bySession.has(m.session)) {
      order.push(m.session);
      bySession.set(m.session, []);
    }
    bySession.get(m.session)!.push(m);
  });
  return order.map((session) => {
    const sessionMatches = bySession.get(session)!;
    return { session, format: sessionMatches[0].format, matches: sessionMatches };
  });
}

/** Live-only rule: if Morning has started and Afternoon's matches haven't, show "Upcoming" instead of "Afternoon". */
function sessionHeaderLabel(group: SessionGroup, dayMatches: RealMatch[], live: boolean): string {
  if (live && group.session === "Afternoon") {
    const afternoonStarted = group.matches.some((m) => (m.status ?? "final") !== "scheduled");
    const morningInProgress = dayMatches.some((m) => m.session === "Morning" && (m.status ?? "final") !== "scheduled");
    if (!afternoonStarted && morningInProgress) return "Upcoming";
  }
  return group.session;
}

function PlaceholderPanel() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-gold-300 bg-cream-50 p-5 text-center shadow-xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-maroon-700 via-gold-400 to-ink-900" />
      <span className="mx-auto mb-2 inline-flex items-center gap-2 rounded-pill bg-white px-3 py-1 font-condensed text-[11px] font-bold uppercase tracking-wide text-maroon-700 shadow-sm">
        <Radio size={13} />
        Live
      </span>
      <h3 className="m-0 font-sans text-lg font-black text-ink-900">Round 1 hasn&rsquo;t started</h3>
      <p className="mt-2 font-sans text-sm text-ink-500">
        Waiting until {LIVE_START_LABEL} ({centralDateLabel()}) for the first tee times. Matches will appear here once they&rsquo;re posted.
      </p>
    </div>
  );
}

/** "Day {n}" label that drops down the other available days on tap — replaces the old day-pill row. */
function DaySelector({ days, activeDay, onSelect }: { days: number[]; activeDay: number; onSelect: (day: number) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3 inline-flex rounded-pill border border-gold-400 bg-cream-50 p-[3px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-pill bg-maroon-700 px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide text-cream-50"
      >
        Day
      </button>
      <div className={["flex overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out", open ? "ml-1 max-w-40 opacity-100" : "max-w-0 opacity-0"].join(" ")}>
        {days.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={day === activeDay}
            onClick={() => {
              onSelect(day);
              setOpen(false);
            }}
            className={[
              "shrink-0 rounded-pill px-3 py-1 font-condensed text-2xs font-bold tabular-nums transition-colors",
              day === activeDay ? "bg-maroon-700 text-cream-50" : "text-ink-500 hover:bg-cream-100",
            ].join(" ")}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TeamMatchesBoard({ tournament, live }: { tournament: Tournament; live: boolean }) {
  const days = [...new Set(tournament.matches.map((m) => m.day))].sort((a, b) => a - b);
  const [userPickedDay, setUserPickedDay] = useState<number | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const day = userPickedDay ?? currentRoundDay(tournament);

  if (days.length === 0) {
    if (!live) {
      return (
        <div className="rounded-md border border-ink-100 bg-cream-50 px-5 py-10 text-center">
          <p className="m-0 font-sans text-sm text-ink-500">No match data available for this tournament yet.</p>
        </div>
      );
    }
    return <PlaceholderPanel />;
  }

  const activeDay = days.includes(day) ? day : days[days.length - 1];
  const dayMatches = tournament.matches.filter((m) => m.day === activeDay);
  const dayMaroonPts = dayMatches.reduce((total, match) => total + match.maroonPts, 0);
  const dayWhitePts = dayMatches.reduce((total, match) => total + match.whitePts, 0);
  const sessionGroups = groupBySession(dayMatches);

  return (
    <div>
      <DaySelector days={days} activeDay={activeDay} onSelect={setUserPickedDay} />

      <div className="flex overflow-hidden rounded-sm border-y border-gold-300">
        <div className="flex h-10 flex-1 items-center justify-between bg-maroon-700 px-3 text-white">
          <span className="font-condensed text-2xs font-bold uppercase tracking-eyebrow">Maroon</span>
          <span className="font-sans text-xl font-black tabular-nums">{fmtPt(dayMaroonPts)}</span>
        </div>
        <div className="w-px bg-gold-500" />
        <div className="flex h-10 flex-1 items-center justify-between bg-white px-3 text-maroon-700">
          <span className="font-sans text-xl font-black tabular-nums">{fmtPt(dayWhitePts)}</span>
          <span className="font-condensed text-2xs font-bold uppercase tracking-eyebrow">White</span>
        </div>
      </div>

      <div>
        {sessionGroups.map((group, index) => (
          <div key={group.session}>
            <div className="grid min-h-8 grid-cols-[30px_minmax(0,1fr)_44px_minmax(0,1fr)_30px] items-center pt-2 font-condensed text-3xs font-black uppercase tracking-wide text-ink-400">
              <span className="text-center">Stat</span>
              <span className="col-span-3 px-1">
                {sessionHeaderLabel(group, dayMatches, live)} &middot; {group.format}
              </span>
              <span className="text-center">Thru</span>
            </div>
            {group.matches.map((match) => (
              <CompactMatchRow
                key={match.id}
                match={match}
                tournament={tournament}
                tournamentSlug={tournament.slug}
                expanded={expandedMatchId === match.id}
                onToggle={() => setExpandedMatchId((id) => (id === match.id ? null : match.id))}
              />
            ))}
            {index < sessionGroups.length - 1 && <div className="h-px bg-ink-100" />}
          </div>
        ))}
      </div>
    </div>
  );
}
