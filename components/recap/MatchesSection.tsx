"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MatchRow } from "@/components/match/MatchRow";
import { defendingIndividualChampion } from "@/lib/data";
import type { RealMatch, Tournament } from "@/lib/data/types";

interface SessionGroup {
  id: string;
  label: string;
  meta: string;
  matches: RealMatch[];
}

function sessionLabel(index: number, match: RealMatch) {
  return `Session ${index + 1} - ${match.format}`;
}

function groupSessions(tournament: Tournament): SessionGroup[] {
  const groups: SessionGroup[] = [];

  tournament.matches.forEach((match) => {
    const id = `${match.day}-${match.session}-${match.format}`;
    const existing = groups.find((group) => group.id === id);
    if (existing) {
      existing.matches.push(match);
      return;
    }

    groups.push({
      id,
      label: sessionLabel(groups.length, match),
      meta: `Day ${match.day} - ${match.session}`,
      matches: [match],
    });
  });

  return groups;
}

function SessionDropdown({
  sessions,
  selectedSession,
  onChange,
}: {
  sessions: SessionGroup[];
  selectedSession?: SessionGroup;
  onChange: (session: SessionGroup) => void;
}) {
  return (
    <div className="group relative z-20 inline-block">
      <button
        type="button"
        className="inline-flex min-h-[42px] items-center gap-2 rounded-sm border border-ink-300 bg-white px-4 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700 shadow-sm transition-colors hover:border-maroon-400 hover:bg-maroon-50"
      >
        {selectedSession?.label ?? "Session"}
        <ChevronDown size={15} />
      </button>
      <div className="invisible absolute right-0 top-full w-[260px] pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-md border border-ink-100 bg-white shadow-lg">
          {sessions.map((session) => {
            const active = selectedSession?.id === session.id;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onChange(session)}
                className={[
                  "block w-full border-b border-ink-100 px-4 py-3 text-left last:border-b-0 transition-colors",
                  active ? "bg-maroon-50" : "hover:bg-cream-50",
                ].join(" ")}
              >
                <span className="block font-condensed text-xs font-semibold uppercase tracking-wide text-ink-900">{session.label}</span>
                <span className="mt-1 block font-sans text-xs text-ink-400">{session.meta}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MatchesSection({ tournament, isLive }: { tournament: Tournament; isLive: boolean }) {
  const [sessionIdByYear, setSessionIdByYear] = useState<Record<number, string>>({});
  const heading = isLive ? "Live Matches" : "Matches";
  const sessions = groupSessions(tournament);
  const champion = defendingIndividualChampion(tournament);
  const selectedSession = sessions.find((session) => session.id === sessionIdByYear[tournament.year]) ?? sessions[0];

  const chooseSession = (session: SessionGroup) => {
    setSessionIdByYear((current) => ({ ...current, [tournament.year]: session.id }));
  };

  return (
    <aside>
      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <div className="mb-1 font-condensed text-[11px] font-semibold uppercase tracking-eyebrow text-maroon-600">
              {tournament.editionLabel}
            </div>
            <h2 className="m-0 font-sans text-[28px] font-extrabold text-ink-900">{heading}</h2>
          </div>
          {sessions.length > 0 && <SessionDropdown sessions={sessions} selectedSession={selectedSession} onChange={chooseSession} />}
        </div>
        <div className="border-t-2 border-ink-900 mb-4" />
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-md border border-gold-400 bg-cream-50 p-5 shadow-md">
          <div className="mb-2 font-condensed text-[11px] font-semibold uppercase tracking-eyebrow text-gold-700">Round 1 - Tee Times</div>
          <h3 className="m-0 font-sans text-xl font-extrabold text-ink-900">Waiting on live scoring</h3>
          <p className="mt-2 font-sans text-sm leading-relaxed text-ink-500">
            No {isLive ? "2027" : tournament.year} match scores have posted yet.
            {isLive && " Round 1 begins at 9:30 CST on January 6, 2027."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-ink-100 bg-white">
          <div className="max-h-[722px] overflow-y-auto">
            {selectedSession?.matches.map((match, index) => (
              <MatchRow key={match.id} match={match} index={index + 1} defendingChampion={champion} />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
