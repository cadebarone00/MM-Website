"use client";

import { useMemo, useState } from "react";

const pars = [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 5, 4, 3, 5];
const yards = [406, 418, 518, 166, 413, 517, 174, 372, 434, 404, 175, 393, 405, 384, 494, 397, 208, 545];
export function LiveScoringPreview() {
  const [hole, setHole] = useState(1);
  const [score, setScore] = useState<number | "">("");
  const [putts, setPutts] = useState<number | "">("");
  const [fir, setFir] = useState(false);
  const [gir, setGir] = useState(false);
  const [saved, setSaved] = useState<Record<number, { score: number; putts: number | ""; fir: boolean; gir: boolean }>>({});
  const current = saved[hole];
  const par = pars[hole - 1];
  const save = () => { if (typeof score === "number" && score > 0) setSaved((all) => ({ ...all, [hole]: { score, putts, fir, gir } })); };
  const completed = useMemo(() => Object.keys(saved).length, [saved]);
  return <div className="mx-auto max-w-xl">
    <div className="flex items-center justify-between gap-3"><div><p className="m-0 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">Preview only · no live data</p><h1 className="mt-1 font-serif text-3xl font-bold text-ink-900">Player Live Scoring</h1></div><span className="rounded-pill bg-maroon-700 px-3 py-1.5 font-condensed text-xs font-bold text-white">THRU {completed || "—"}</span></div>
    <p className="mt-2 font-sans text-sm text-ink-600">This is the scoring flow a player sees once their match is live. The opponent&apos;s entry and the player&apos;s self-reported score must agree before the hole becomes official.</p>
    <div className="mt-5 grid grid-cols-9 gap-1 sm:grid-cols-18">{Array.from({ length: 18 }, (_, index) => index + 1).map((item) => <button key={item} type="button" onClick={() => { setHole(item); const prior = saved[item]; setScore(prior?.score ?? ""); setPutts(prior?.putts ?? ""); setFir(prior?.fir ?? false); setGir(prior?.gir ?? false); }} className={item === hole ? "h-9 rounded-sm bg-maroon-700 font-condensed text-xs font-bold text-white" : saved[item] ? "h-9 rounded-sm bg-gold-100 font-condensed text-xs font-bold text-maroon-700" : "h-9 rounded-sm bg-cream-100 font-condensed text-xs font-bold text-ink-600"}>{item}</button>)}</div>
    <section className="mt-5 rounded-md border border-gold-200 bg-white p-4"><div className="flex items-baseline justify-between"><h2 className="m-0 font-serif text-2xl font-bold text-ink-900">Hole {hole}</h2><p className="m-0 font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">Par {par} · {yards[hole - 1]} yards</p></div>
      <div className="mt-4 grid grid-cols-2 gap-3"><label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Opponent&apos;s score<input type="number" min={1} value={score} onChange={(event) => setScore(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 block w-full rounded-sm border border-gold-300 px-3 py-2 font-sans text-lg font-bold normal-case text-ink-900" placeholder="—" /></label><label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Your score<input type="number" min={1} value={score} onChange={(event) => setScore(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 block w-full rounded-sm border border-gold-300 px-3 py-2 font-sans text-lg font-bold normal-case text-ink-900" placeholder="—" /></label></div>
      <div className="mt-4 grid grid-cols-3 gap-3"><label className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">Putts<input type="number" min={0} value={putts} onChange={(event) => setPutts(event.target.value === "" ? "" : Number(event.target.value))} className="mt-1 block w-full rounded-sm border border-gold-300 px-3 py-2 font-sans text-base font-bold normal-case text-ink-900" placeholder="—" /></label><label className="mt-6 flex items-center gap-2 font-sans text-sm font-semibold text-ink-700"><input type="checkbox" checked={fir} onChange={(event) => setFir(event.target.checked)} /> Fairway hit</label><label className="mt-6 flex items-center gap-2 font-sans text-sm font-semibold text-ink-700"><input type="checkbox" checked={gir} onChange={(event) => setGir(event.target.checked)} /> Green hit</label></div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-gold-100 pt-4"><p className="m-0 font-sans text-xs text-ink-500">{current ? "Preview score saved locally." : "Entering matching scores would show a green confirmed state here."}</p><button type="button" onClick={save} className="rounded-sm bg-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-white">Save preview score</button></div>
    </section>
  </div>;
}
