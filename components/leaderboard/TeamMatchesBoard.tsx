"use client";

import { useState } from "react";
import { ChevronDown, Radio } from "lucide-react";
import { CompactMatchRow } from "./CompactMatchRow";
import { centralDateLabel, currentRoundDay, LIVE_START_LABEL } from "./matchUtils";
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
  const otherDays = days.filter((d) => d !== activeDay);

  return (
    <div className="relative mb-3 inline-block">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 font-condensed text-base font-black uppercase tracking-wide text-ink-900"
      >
        Day {activeDay}
        {otherDays.length > 0 && <ChevronDown size={16} className={["transition-transform", open ? "rotate-180" : ""].join(" ")} />}
      </button>
      {open && otherDays.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[110px] overflow-hidden rounded-md border border-ink-100 bg-white shadow-lg">
          {otherDays.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                onSelect(d);
                setOpen(false);
              }}
              className="block w-full px-4 py-2 text-left font-condensed text-sm font-semibold text-ink-700 hover:bg-cream-50"
            >
              Day {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamMatchesBoard({ tournament, live }: { tournament: Tournament; live: boolean }) {
  const days = [...new Set(tournament.matches.map((m) => m.day))].sort((a, b) => a - b);
  const [userPickedDay, setUserPickedDay] = useState<number | null>(null);
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
  const sessionGroups = groupBySession(dayMatches);

  return (
    <div>
      <DaySelector days={days} activeDay={activeDay} onSelect={setUserPickedDay} />

      <div className="flex overflow-hidden rounded-sm">
        <div className="flex-1 bg-maroon-700 py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-white">Maroon</div>
        <div className="flex-1 border-y border-ink-100 bg-white py-1.5 text-center font-condensed text-2xs font-bold uppercase tracking-eyebrow text-maroon-700">
          White
        </div>
      </div>

      <div>
        {sessionGroups.map((group, index) => (
          <div key={group.session}>
            <div className="px-1 py-1.5 font-condensed text-3xs font-black uppercase tracking-wide text-ink-400">
              {sessionHeaderLabel(group, dayMatches, live)} &middot; {group.format}
            </div>
            {group.matches.map((match) => (
              <CompactMatchRow key={match.id} match={match} tournamentSlug={tournament.slug} />
            ))}
            {index < sessionGroups.length - 1 && <div className="h-px bg-ink-100" />}
          </div>
        ))}
      </div>
    </div>
  );
}
