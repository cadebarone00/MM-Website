"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { ResultChevron } from "@/components/match/ResultChevron";
import { MatchRow } from "@/components/match/MatchRow";
import { defendingIndividualChampion } from "@/lib/data";
import { centralDateLabel, currentRoundDay, matchLabel, matchLeader, matchStatus, LIVE_START_LABEL } from "./matchUtils";
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
    const afternoonStarted = group.matches.some((m) => matchStatus(m) !== "scheduled");
    const morningInProgress = dayMatches.some((m) => m.session === "Morning" && matchStatus(m) !== "scheduled");
    if (!afternoonStarted && morningInProgress) return "Upcoming";
  }
  return group.session;
}

function RecapStrip({ matches }: { matches: RealMatch[] }) {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-gold-200 bg-cream-50 py-2">
      {matches.map((match) => (
        <ResultChevron key={match.id} winner={matchLeader(match)} size="sm">
          {matchLabel(match)}
        </ResultChevron>
      ))}
    </div>
  );
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

export function TeamMatchesBoard({ tournament, live }: { tournament: Tournament; live: boolean }) {
  const days = [...new Set(tournament.matches.map((m) => m.day))].sort((a, b) => a - b);
  const [userPickedDay, setUserPickedDay] = useState<number | null>(null);
  const day = userPickedDay ?? currentRoundDay(tournament);
  const champion = defendingIndividualChampion(tournament);

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
      <div className="mb-4 flex flex-wrap gap-1.5 sm:mb-6 sm:gap-2">
        {days.map((d) => {
          const on = d === activeDay;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setUserPickedDay(d)}
              className={[
                "rounded-pill border px-3 py-1.5 font-condensed text-xs font-black uppercase tracking-wide transition-colors sm:px-4 sm:py-2 sm:text-sm",
                on ? "border-gold-400 bg-maroon-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-gold-400",
              ].join(" ")}
            >
              Day {d}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-gold-300 bg-white shadow-lg">
        {sessionGroups.map((group, index) => (
          <div key={group.session}>
            <div className="border-b border-gold-200 bg-cream-50 px-4 py-2 font-condensed text-xs font-black uppercase tracking-wide text-gold-700">
              {sessionHeaderLabel(group, dayMatches, live)} · {group.format}
            </div>
            {group.matches.map((match) => (
              <MatchRow key={match.id} match={match} defendingChampion={champion} tournamentSlug={tournament.slug} size="lg" />
            ))}
            {group.matches.length > 1 && <RecapStrip matches={group.matches} />}
            {index < sessionGroups.length - 1 && <div className="h-px bg-ink-100" />}
          </div>
        ))}
      </div>
    </div>
  );
}
