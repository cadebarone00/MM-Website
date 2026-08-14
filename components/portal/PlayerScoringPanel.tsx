"use client";

import { useEffect, useState } from "react";
import { ScoreEntryCard } from "./ScoreEntryCard";
import type { PlayerRounds } from "@/lib/scorekeeper/types";

export function PlayerScoringPanel() {
  const [rounds, setRounds] = useState<PlayerRounds[]>([]);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/portal/score/round", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }
      setRounds(data.rounds);
      setWaiting(data.waiting ?? null);
      setError(null);
    } catch {
      setError("Couldn't reach the scoring system.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount + poll, matching lib/hooks/useLiveTournament.ts; `load` is reused by submitHole so it can't be nested inside this effect.
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  async function submitHole(round: number, target: "self" | "partner", hole: number, score: number, putts: number, fir: boolean, gir: boolean) {
    const res = await fetch("/api/portal/score/submit-hole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round, target, hole, score, putts, fir, gir }),
    });
    const data = await res.json();
    if (data.ok) load();
    return data;
  }

  if (loading) return <p className="font-sans text-sm text-ink-400">Loading your rounds…</p>;
  if (error) return <p className="font-sans text-sm text-red-600">{error}</p>;
  if (waiting) return <p className="font-sans text-sm text-ink-500">{waiting}</p>;
  if (rounds.length === 0) return <p className="font-sans text-sm text-ink-500">No round started yet.</p>;

  return (
    <div className="flex flex-col gap-6">
      {rounds.map((r) => (
        <div key={r.round}>
          <h2 className="font-serif text-lg font-bold text-ink-900">Round {r.round}</h2>
          <div className="mt-3 flex flex-col gap-4">
            <ScoreEntryCard
              label="My Score"
              holes={r.holes}
              onSubmitHole={(hole, score, putts, fir, gir) => submitHole(r.round, "self", hole, score, putts, fir, gir)}
            />
            {r.partner ? (
              <ScoreEntryCard
                label={`${r.partner}'s Score`}
                holes={r.partnerHoles ?? []}
                onSubmitHole={(hole, score, putts, fir, gir) => submitHole(r.round, "partner", hole, score, putts, fir, gir)}
              />
            ) : (
              <p className="font-sans text-sm text-ink-500">No partner assigned for this round yet.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
