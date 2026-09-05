"use client";

import { useMemo, useState } from "react";

const pars = [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 5, 4, 3, 5];
const yards = [406, 418, 518, 166, 413, 517, 174, 372, 434, 404, 175, 393, 405, 384, 494, 397, 208, 545];

type SavedHole = {
  score: number;
  playerXScore: number;
  putts: number | "";
  fir: boolean;
  gir: boolean;
  disputed?: boolean;
};

const initialSaved: Record<number, SavedHole> = {
  1: { score: 4, playerXScore: 5, putts: 2, fir: true, gir: true },
  2: { score: 5, playerXScore: 4, putts: 2, fir: false, gir: false, disputed: true },
};

export function LiveScoringPreview() {
  const [hole, setHole] = useState(3);
  const [score, setScore] = useState<number | "">("");
  const [playerXScore, setPlayerXScore] = useState<number | "">("");
  const [putts, setPutts] = useState<number | "">("");
  const [fir, setFir] = useState(false);
  const [gir, setGir] = useState(false);
  const [saved, setSaved] = useState<Record<number, SavedHole>>(initialSaved);
  const [message, setMessage] = useState("");
  const par = pars[hole - 1];
  const completed = useMemo(() => Object.keys(saved).length, [saved]);

  function selectHole(nextHole: number) {
    setHole(nextHole);
    const prior = saved[nextHole];
    setScore(prior?.score ?? "");
    setPlayerXScore(prior?.playerXScore ?? "");
    setPutts(prior?.putts ?? "");
    setFir(prior?.fir ?? false);
    setGir(prior?.gir ?? false);
    setMessage(prior?.disputed ? "This preview hole has a score disagreement to review." : "");
  }

  function save() {
    if (typeof score !== "number" || score < 1 || typeof playerXScore !== "number" || playerXScore < 1) {
      setMessage("Enter both players' scores before saving this hole.");
      return;
    }
    setSaved((all) => ({ ...all, [hole]: { score, playerXScore, putts, fir, gir } }));
    setMessage("Score saved locally in this preview. A matching entry from the other scorer makes it official.");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 font-condensed text-sm font-bold uppercase tracking-wide text-ink-900 sm:text-base">
          Round X <span className="mx-1 text-gold-600">—</span> Maroon Masters Golf Club
        </p>
        <span className="shrink-0 rounded-pill border border-gold-400 bg-cream-100 px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wider text-maroon-700">Preview</span>
      </div>

      <div className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" aria-label="Hole selector">
        {Array.from({ length: 18 }, (_, index) => index + 1).map((item) => {
          const savedHole = saved[item];
          const stateClass = savedHole?.disputed
            ? "border-red-600 bg-red-600 text-white"
            : savedHole
              ? "border-maroon-700 bg-maroon-700 text-white"
              : "border-gold-300 bg-cream-100 text-ink-700";
          return (
            <button
              key={item}
              type="button"
              onClick={() => selectHole(item)}
              className={`h-10 min-w-10 rounded-sm border font-condensed text-sm font-bold transition ${stateClass} ${item === hole ? "ring-2 ring-gold-500 ring-offset-2" : ""}`}
              aria-label={`Hole ${item}${savedHole?.disputed ? ", disputed" : savedHole ? ", entered" : ""}`}
            >
              {item}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-gold-200 pt-4">
        <p className="m-0 font-condensed text-sm font-bold uppercase tracking-wide text-ink-700">
          Hole {hole} <span className="mx-1 text-gold-600">—</span> Par {par} <span className="mx-1 text-gold-600">—</span> {yards[hole - 1]} yards
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">
            Cade's score
            <input type="number" min={1} value={score} onChange={(event) => setScore(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-3 py-2 font-sans text-lg font-bold normal-case text-ink-900" placeholder="—" />
          </label>
          <label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">
            Pete's score
            <input type="number" min={1} value={playerXScore} onChange={(event) => setPlayerXScore(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-3 py-2 font-sans text-lg font-bold normal-case text-ink-900" placeholder="—" />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">
            Putts
            <input type="number" min={0} value={putts} onChange={(event) => setPutts(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 block w-full rounded-sm border border-gold-300 bg-white px-3 py-2 font-sans text-base font-bold normal-case text-ink-900" placeholder="—" />
          </label>
          <label className="mt-5 flex cursor-pointer items-center gap-2 font-sans text-sm font-semibold text-ink-700"><input type="checkbox" checked={fir} onChange={(event) => setFir(event.target.checked)} /> Fairway</label>
          <label className="mt-5 flex cursor-pointer items-center gap-2 font-sans text-sm font-semibold text-ink-700"><input type="checkbox" checked={gir} onChange={(event) => setGir(event.target.checked)} /> Green</label>
        </div>

        {message ? <p className={`mt-4 mb-0 font-sans text-xs ${saved[hole]?.disputed ? "text-red-700" : "text-ink-500"}`}>{message}</p> : null}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-gold-200 pt-4">
          <span className="font-condensed text-2xs font-bold uppercase tracking-wider text-ink-500">THRU {completed || "—"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="rounded-sm bg-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-white">Save score</button>
            <button type="button" onClick={() => hole < 18 && selectHole(hole + 1)} disabled={hole === 18} className="rounded-sm border border-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700 disabled:cursor-not-allowed disabled:opacity-40">Next hole</button>
          </div>
        </div>
      </div>
    </div>
  );
}
