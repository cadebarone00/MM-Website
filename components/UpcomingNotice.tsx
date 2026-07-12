import { CalendarClock } from "lucide-react";
import { nextTournament } from "@/lib/data";

function isSet(value: string): boolean {
  return value.trim().length > 0 && value.trim().toLowerCase() !== "tbd";
}

export function UpcomingNotice({ what }: { what: string }) {
  const rosterKnown = !!nextTournament.roster && (nextTournament.roster.maroon.length > 0 || nextTournament.roster.white.length > 0);
  const details = [nextTournament.venue, nextTournament.location].filter(isSet).join(" · ");

  return (
    <div className="bg-cream-100 border border-dashed border-ink-300 rounded-lg p-8 text-center">
      <CalendarClock className="mx-auto mb-3 text-maroon-600" width={28} height={28} />
      <div className="font-serif text-2xl font-semibold text-ink-900 mb-2">{nextTournament.editionLabel}</div>
      {details && (
        <div className="font-condensed text-[13px] font-semibold tracking-wide uppercase text-maroon-700 mb-2">
          {details} · {nextTournament.dateLabel}
        </div>
      )}
      <p className="font-sans text-sm text-ink-500 max-w-[420px] mx-auto">
        {rosterKnown
          ? `${what} for ${nextTournament.dateLabel} hasn’t been posted yet — check back closer to the trip.`
          : `${what} for ${nextTournament.dateLabel} hasn’t been set yet — the roster and pairings will appear here once they’re finalized.`}
      </p>
    </div>
  );
}
