"use client";

import { useState } from "react";
import type { PlayerRound } from "@/lib/platform/playerRounds";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import { ProfileRoundSheet } from "./ProfileRoundSheet";

const SOURCE: Record<PlayerRound["source"], string> = { trip: "Golf trip", tournament: "Tournament", personal: "Logged myself", history: "Past trip", legacy: "The Maroon (imported)" };
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

/**
 * Profile → Rounds: my saved golf rounds (supabase/player_rounds.sql), newest first, with whether each counts toward
 * handicap. Tapping a round opens it in the trip-style round sheet (ProfileRoundSheet). `name` / `avatarUrl`: whose rounds.
 */
export function PlayerRoundsList({ rounds, name, avatarUrl }: { rounds: ProfileHistoryRound[]; name: string; avatarUrl: string | null }) {
  const [open, setOpen] = useState<ProfileHistoryRound | null>(null);
  return <section aria-label="Golf rounds" className="px-4 py-5">
    <h2 className="m-0 font-condensed text-sm font-semibold uppercase tracking-wide text-gold-300">Golf rounds</h2>
    {rounds.length === 0 ? <p className="mt-2 text-cream-50/70">Rounds you finish will show here.</p>
      : <ol className="mt-2">{rounds.map((round) => <li key={round.id} className="border-t border-cream-50/10 first:border-t-0">
        <button type="button" onClick={() => setOpen(round)} aria-haspopup="dialog"
          className="flex w-full items-start justify-between gap-3 py-3 text-left focus-visible:rounded focus-visible:outline-2 focus-visible:outline-gold-300">
          <div className="min-w-0">
            <p className="font-semibold text-cream-50">{round.course.name}</p>
            <p className="text-sm text-cream-50/70">{day(round.datePlayed)} · {round.sourceLabel ?? SOURCE[round.source]}{round.enteredBy === "organizer" ? " · Entered by organizer" : ""}</p>
            <p className="text-sm text-cream-50/55">{round.countsForHandicap ? `Counts · differential ${round.differential}` : `Not counted · ${round.notCountedReason}`}</p>
          </div>
          <p className="text-xl font-bold text-cream-50">{round.total}</p>
        </button>
      </li>)}</ol>}
    {open && <ProfileRoundSheet key={open.id} round={open} name={name} avatarUrl={avatarUrl} onClose={() => setOpen(null)} />}
  </section>;
}
