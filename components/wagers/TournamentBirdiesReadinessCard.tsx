"use client";

import { useEffect, useState } from "react";

type Readiness = {
  seasonYear: number;
  ready: boolean;
  blockers: string[];
  rounds: { round: number; course: string | null; format: string | null; eligibleForBirdies: boolean; status: "ready" | "missing"; detail: string }[];
};

export function TournamentBirdiesReadinessCard({ playerSlug, playerName }: { playerSlug: string; playerName: string }) {
  const [state, setState] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/wagers/player-tournament-birdies/${playerSlug}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not check wager setup.");
        return payload as Readiness;
      })
      .then((payload) => { if (active) setState(payload); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not check wager setup."); });
    return () => { active = false; };
  }, [playerSlug]);

  return (
    <article className="rounded-lg border border-gold-300 bg-white p-4">
      <p className="font-condensed text-2xs font-bold uppercase tracking-eyebrow text-ink-500">Tournament Future</p>
      <h3 className="mt-1 font-serif text-xl font-bold text-ink-900">{playerName} — Total Tournament Birdies</h3>
      {!state && !error && <p className="mt-3 font-sans text-sm text-ink-500">Checking what is needed to create this market…</p>}
      {error && <p className="mt-3 font-sans text-sm text-red-700">{error}</p>}
      {state && (
        <>
          <p className={`mt-3 rounded-md px-3 py-2 font-sans text-sm font-semibold ${state.ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {state.ready ? "Ready to create odds from the tournament simulation." : "Odds are not posted yet — tournament setup is incomplete."}
          </p>
          {!state.ready && <ul className="mt-3 list-disc space-y-1 pl-5 font-sans text-sm text-ink-700">
            {state.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>}
          {state.rounds.length > 0 && <div className="mt-4 divide-y divide-gold-100 border-y border-gold-100">
            {state.rounds.map((round) => <div key={round.round} className="py-2">
              <p className="font-sans text-sm font-semibold text-ink-900">Round {round.round}{round.course ? ` · ${round.course}` : ""}{round.format ? ` · ${round.format}` : ""}</p>
              <p className={`mt-0.5 font-sans text-xs ${round.status === "ready" ? "text-emerald-700" : "text-amber-800"}`}>{round.detail}</p>
            </div>)}
          </div>}
          <p className="mt-4 font-sans text-xs leading-5 text-ink-500">When every requirement is complete, this card will post the featured O/U line and alternate-line slider from the 10,000-run model.</p>
        </>
      )}
    </article>
  );
}
