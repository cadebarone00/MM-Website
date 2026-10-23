"use client";

import { useState } from "react";
import { cutLabel, type TournamentCut } from "@/lib/platform/codeTournaments";

/** "+4" / "4" / "E" / "-2" → a to-par number; null if it isn't one. */
const toPar = (text: string) => { const t = text.trim().toUpperCase(); if (t === "E") return 0; return /^[+-]?\d{1,3}$/.test(t) ? Number(t) : null; };
const whole = (text: string) => /^\d{1,3}$/.test(text.trim()) && Number(text) >= 1 ? Number(text) : null;

/** What a cut reads as: "Top 10 & ties after Round 2" / "+4 or better after Round 2". */
export const cutSummary = (cut: TournamentCut) => `${cut.kind === "top" ? `Top ${cut.value} & ties` : `${cutLabel(cut.value)} or better`} after Round ${cut.after}`;

/**
 * The organizer's cut questions: is there a cut; if so, top players (how many make it, ties included) or a cut number
 * (to par, at or better makes it), and after which round. `onChange` gets the cut, null for none, or undefined while an
 * answer is missing or doesn't make sense (Create / Save stay off). Needs two or more rounds.
 * `css`: the page's own classes (the light Create page or the dark tournament page).
 */
export function CutFields({ initial, rounds, net, onChange, css }: { initial: TournamentCut | null; rounds: number; net: boolean;
  onChange: (cut: TournamentCut | null | undefined) => void; css: { field: string; choices: string; blurb: string } }) {
  const [kind, setKind] = useState<"none" | TournamentCut["kind"]>(initial?.kind ?? "none");
  const [players, setPlayers] = useState(initial?.kind === "top" ? String(initial.value) : "");
  const [score, setScore] = useState(initial?.kind === "score" ? cutLabel(initial.value) : "");
  const [after, setAfter] = useState(() => Math.min(initial?.after ?? Math.ceil(rounds / 2), Math.max(rounds - 1, 1)));
  const round = Math.min(after, Math.max(rounds - 1, 1));
  function report(next: { kind?: typeof kind; players?: string; score?: string; after?: number }) {
    const k = next.kind ?? kind, r = Math.min(next.after ?? after, Math.max(rounds - 1, 1));
    if (k === "none") return onChange(null);
    const value = k === "top" ? whole(next.players ?? players) : toPar(next.score ?? score);
    onChange(rounds < 2 || value === null ? undefined : { kind: k, value, after: r });
  }
  const set = (next: Parameters<typeof report>[0]) => {
    if (next.kind) setKind(next.kind); if (next.players !== undefined) setPlayers(next.players); if (next.score !== undefined) setScore(next.score); if (next.after) setAfter(next.after);
    report(next);
  };
  return <fieldset className={css.field}><legend>Cut</legend>
    <div className={css.choices}>{([["none", "No cut"], ["top", "Top players"], ["score", "Cut number"]] as const).map(([value, label]) =>
      <button key={value} type="button" aria-pressed={kind === value} disabled={value !== "none" && rounds < 2} onClick={() => set({ kind: value })}>{label}</button>)}</div>
    {rounds < 2 ? <p className={css.blurb}>A cut needs two or more rounds. Add another round to set one.</p>
      : kind === "none" ? <p className={css.blurb}>Everyone plays every round.</p>
      : <>
        {kind === "top" ? <label className={css.field}><span>How many players make the cut</span>
          <input inputMode="numeric" placeholder="e.g. 10" value={players} onChange={(e) => set({ players: e.target.value })} /></label>
          : <label className={css.field}><span>Cut number (to par)</span>
          <input inputMode="text" placeholder="e.g. +4" value={score} onChange={(e) => set({ score: e.target.value })} /></label>}
        {rounds > 2 && <label className={css.field}><span>Cut after</span>
          <select value={round} onChange={(e) => set({ after: Number(e.target.value) })}>
            {Array.from({ length: rounds - 1 }, (_, i) => <option key={i} value={i + 1}>Round {i + 1}</option>)}</select></label>}
        <p className={css.blurb}>{kind === "top"
          ? `The top ${whole(players) ?? "—"} players${net ? " on net" : ""} after Round ${round}, plus anyone tied with the last spot, play on.`
          : `Players at ${toPar(score) === null ? "—" : cutLabel(toPar(score)!)} or better${net ? " (net)" : ""} after Round ${round} play on.`} Everyone else misses the cut.</p>
      </>}
  </fieldset>;
}
