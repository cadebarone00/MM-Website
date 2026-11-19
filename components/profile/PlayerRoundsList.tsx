"use client";

import { useState } from "react";
import { nineHolePairs, type PlayerRound } from "@/lib/platform/playerRounds";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import { ProfileRoundSheet } from "./ProfileRoundSheet";

/** Rounds that show their trip / league / tourney name next to the date. */
const NAMED = new Set<PlayerRound["source"]>(["trip", "league", "tourney", "tournament"]);
/** The small letter on each round: P Play, T Trip, L League, C Tourney (Competition). Past-trip and imported rounds have none. */
const LETTER: Partial<Record<PlayerRound["source"], { letter: string; name: string }>> = {
  personal: { letter: "P", name: "Play" }, trip: { letter: "T", name: "Golf trip" }, league: { letter: "L", name: "League" },
  tourney: { letter: "C", name: "Tourney" }, tournament: { letter: "C", name: "Tournament" } };
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Profile → Rounds: my saved golf rounds (supabase/player_rounds.sql), newest first: where it came from (the letter), the
 * course, the date (and the trip / league / tourney's name), the score and, small under it, the handicap differential. Tapping a round opens it in the trip-style round sheet (ProfileRoundSheet). `name` / `avatarUrl`: whose rounds.
 */
export function PlayerRoundsList({ rounds, name, avatarUrl }: { rounds: ProfileHistoryRound[]; name: string; avatarUrl: string | null }) {
  const [open, setOpen] = useState<ProfileHistoryRound | null>(null);
  // 9-hole rounds count in pairs: each paired 9 shows the pair's combined differential; the newest unpaired one waits.
  const pairs = nineHolePairs(rounds);
  const under = (round: ProfileHistoryRound) => {
    if (round.countsForHandicap && round.differential !== null) return { text: String(round.differential), label: `Handicap differential ${round.differential}` };
    const pair = pairs.get(round.id);
    if (pair === "waiting") return { text: "Waiting for 9", label: "Counts once another 9-hole round comes in" };
    if (pair) return { text: `${pair.differential} · 9+9`, label: `Combined with another 9: differential ${pair.differential}` };
    return { text: "Not counted", label: "Doesn't count toward handicap" };
  };
  return <section aria-label="Golf rounds" className="px-4 py-5">
    <h2 className="m-0 font-condensed text-sm font-semibold uppercase tracking-wide text-gold-300">Golf rounds</h2>
    {rounds.length === 0 ? <p className="mt-2 text-cream-50/70">Rounds you finish will show here.</p>
      : <ol className="mt-2">{rounds.map((round) => <li key={round.id} className="border-t border-cream-50/10 first:border-t-0">
        <button type="button" onClick={() => setOpen(round)} aria-haspopup="dialog"
          className="flex w-full items-start justify-between gap-3 py-3 text-left focus-visible:rounded focus-visible:outline-2 focus-visible:outline-gold-300">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-cream-50">
              {LETTER[round.source] && <span title={LETTER[round.source]!.name} aria-label={`From ${LETTER[round.source]!.name}`}
                className="grid h-5 w-5 flex-none place-items-center rounded-full border border-gold-300/60 font-condensed text-[11px] font-bold leading-none text-gold-300">{LETTER[round.source]!.letter}</span>}
              <span className="min-w-0 truncate">{round.course.name}</span>
            </p>
            {/* The date, and the trip / league / tourney's name only for those (a Play round is just its date). */}
            <p className="text-sm text-cream-50/70">{day(round.datePlayed)}{NAMED.has(round.source) && round.sourceLabel ? ` · ${round.sourceLabel}` : ""}</p>
          </div>
          {/* The gross score, with the handicap differential small under it (why it doesn't count is in the round itself). */}
          <div className="flex-none text-right">
            <p className="text-xl font-bold leading-tight text-cream-50">{round.total}</p>
            <p className="text-xs text-cream-50/55" aria-label={under(round).label}>{under(round).text}</p>
          </div>
        </button>
      </li>)}</ol>}
    {open && <ProfileRoundSheet key={open.id} round={open} name={name} avatarUrl={avatarUrl} nineHolePair={pairs.get(open.id)} onClose={() => setOpen(null)} />}
  </section>;
}
