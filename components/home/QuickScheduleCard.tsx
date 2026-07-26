"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { nextTournament } from "@/lib/data";

function placeholderDateLabel(startDate: string): string {
  const [year, month, day] = startDate.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

export function QuickScheduleCard() {
  const { tournament } = useLiveTournament();
  const liveMatch = tournament.matches.find((match) => match.status === "live");

  return (
    <Link
      href="/schedule"
      className="group flex flex-col gap-2 rounded-md border border-gold-400 bg-cream-50 p-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg sm:gap-3 sm:p-3"
    >
      <div className="flex items-center gap-1.5 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">
        <CalendarDays size={14} />
        Schedule
      </div>
      {liveMatch ? (
        <div>
          <div className="font-sans text-xs font-bold text-ink-900 sm:text-sm">
            Round {liveMatch.day} &mdash; {liveMatch.session}
          </div>
          <div className="font-sans text-2xs text-ink-500 sm:text-xs">{liveMatch.format}</div>
        </div>
      ) : (
        <div>
          <div className="font-sans text-xs font-bold text-ink-900 sm:text-sm">
            Round 1 starts {placeholderDateLabel(nextTournament.startDate)}
          </div>
          <div className="font-sans text-2xs text-ink-500 sm:text-xs">{nextTournament.venue}</div>
        </div>
      )}
    </Link>
  );
}
