"use client";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { roundStats, type RoundStats } from "@/lib/profile/roundStats";
import { sampleProfileRounds } from "@/lib/dev/sampleProfileRounds";
import { useSimulator } from "@/components/dev/SimulatorBridge";

/**
 * Profile → Stats → Compare (owner only): a ring per stat, my arc (outer, maroon) and a friend's (inner, amber) on the
 * same ring, with both numbers written under it. Pick who (people I've played with, or search any Public profile) and
 * which stats. Colours validated for colour-blind separation; numbers are always written, never colour alone.
 */

const ME = "#9e2a44";
const THEM = "#c07d1a";
type Person = { username: string; name: string; friend?: boolean };
type Metric = { key: string; label: string; lowerIsBetter?: boolean; value: (s: RoundStats) => number | null };
const METRICS: Metric[] = [
  { key: "fairways", label: "Fairways", value: (s) => s.driving?.fairwayPct ?? null },
  { key: "gir", label: "Greens (GIR)", value: (s) => s.approach?.girPct ?? null },
  { key: "birdie", label: "Birdie or better", value: (s) => s.scoring?.birdiePct ?? null },
  { key: "parPlus", label: "Par or better", value: (s) => s.scoring?.parOrBetterPct ?? null },
  { key: "scrambling", label: "Scrambling", value: (s) => s.scrambling?.pct ?? null },
  { key: "onePutt", label: "1-putts", value: (s) => s.putting?.onePuttPct ?? null },
  { key: "threePutt", label: "3-putts", lowerIsBetter: true, value: (s) => s.putting?.threePuttPct ?? null },
  { key: "doubles", label: "Double or worse", lowerIsBetter: true, value: (s) => s.scoring?.doublePct ?? null },
];
const DEFAULT = ["fairways", "gir", "birdie", "scrambling"];
/** DEV ONLY: only offered when the app simulator's Profile condition "Sample stats data" is on. */
const SAMPLE: Person = { username: "__sample__", name: "Sample golfer" };
/** The Golf Trip's pill look (GolfTripMatch.module.css .profileRoundTabs): gold outline, filled gold when picked. */
const pill = (on: boolean) => `min-h-[32.3px] flex-none whitespace-nowrap rounded-full border px-[15.3px] font-sans text-[12.75px] font-bold leading-none tracking-[.02em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dcc495] ${on ? "border-[#dcc495] bg-[#dcc495] text-[#240001]" : "border-[rgba(220,196,149,.55)] bg-transparent text-[#dcc495]"}`;
/** One row of pills that scrolls sideways (runs to the screen edges; no scrollbar). */
const pillRow = "-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
type Loaded = { status: "idle" | "loading" } | { status: "ok"; person: Person; stats: RoundStats | null } | { status: "private" | "not_found" | "error"; person?: Person };

export function CompareRings({ mine }: { mine: RoundStats }) {
  const [picked, setPicked] = useState<string[]>(DEFAULT);
  const sampleOn = useSimulator()?.state.sampleStats === true;
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState<Loaded>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Person[]>([]);

  useEffect(() => {
    fetch("/api/profile/compare/people", { cache: "no-store" }).then((r) => r.json() as Promise<{ people?: Person[] }>)
      .then((body) => setPeople(body.people ?? [])).catch(() => { /* search still works */ });
  }, []);
  const text = query.trim();
  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/account/search?q=${encodeURIComponent(text)}`, { signal: controller.signal }).then((r) => r.json() as Promise<{ accounts?: { username: string; name: string }[] }>)
        .then((body) => setFound((body.accounts ?? []).map((a) => ({ username: a.username, name: a.name })))).catch(() => { /* keep typing */ });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [text]);

  async function compare(person: Person) {
    setQuery(""); setFound([]);
    // DEV ONLY (simulator condition): a made-up golfer to compare against, without anyone's real data.
    if (person.username === SAMPLE.username) { setLoaded({ status: "ok", person, stats: roundStats(sampleProfileRounds(20, 2, 31)) }); return; }
    setLoaded({ status: "loading" });
    try {
      const body = await fetch(`/api/profile/compare?u=${encodeURIComponent(person.username)}`, { cache: "no-store" }).then((r) => r.json()) as { result?: { status: string; person?: Person; stats?: RoundStats | null } };
      const result = body.result;
      if (result?.status === "ok" && result.person) setLoaded({ status: "ok", person: result.person, stats: result.stats ?? null });
      else setLoaded({ status: result?.status === "private" ? "private" : result?.status === "not_found" ? "not_found" : "error", person: result?.person ?? person });
    } catch { setLoaded({ status: "error", person }); }
  }

  const them = loaded.status === "ok" ? loaded : null;
  const shown = METRICS.filter((m) => picked.includes(m.key));
  const toggle = (key: string) => setPicked((all) => all.includes(key) ? all.filter((k) => k !== key) : [...all, key]);
  const activeName = "person" in loaded ? loaded.person?.username : undefined;

  // On the profile's maroon background (no box): gold pills that scroll sideways, light text.
  return <section aria-label="Compare" className="mt-2 min-w-0 text-cream-50">
    <h3 className="m-0 font-condensed text-xs font-semibold uppercase tracking-[0.14em] text-gold-300">Compare</h3>

    <div className={`mt-3 ${pillRow}`} role="group" aria-label="Compare with">
      {(sampleOn ? [...people, SAMPLE] : people).map((p) => <button key={p.username} type="button" aria-pressed={activeName === p.username} onClick={() => compare(p)}
        className={pill(activeName === p.username)}
        aria-label={`${p.name}${p.friend ? " (friend)" : ""}`}>{firstName(p.name)}{p.friend && <span aria-hidden="true" className="ml-1 text-[10px] opacity-70">★</span>}</button>)}
      {them && <button type="button" onClick={() => setLoaded({ status: "idle" })} className="inline-flex min-h-[32.3px] flex-none items-center gap-1 rounded-full px-2 text-sm text-cream-50/70" aria-label="Stop comparing"><X size={14} aria-hidden="true" /> Clear</button>}
    </div>
    <label className="mt-2 flex min-h-11 items-center gap-2 rounded-full border border-[rgba(220,196,149,.55)] px-4 text-cream-50">
      <Search size={16} aria-hidden="true" className="text-[#dcc495]" />
      <span className="sr-only">Find a player to compare with</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={people.length ? "Or search any player" : "Search a player to compare with"} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-cream-50/50" />
    </label>
    {text.length >= 2 && found.length > 0 && <ul className="mt-1 grid gap-1">
      {found.slice(0, 5).map((p) => <li key={p.username}><button type="button" onClick={() => compare(p)} className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-cream-50/10">
        <span className="font-semibold">{p.name}</span><span className="text-cream-50/55">@{p.username}</span></button></li>)}
    </ul>}

    {loaded.status === "loading" && <p className="mt-3 text-sm text-cream-50/70">Loading their stats…</p>}
    {(loaded.status === "private" || loaded.status === "not_found" || loaded.status === "error") && <p className="mt-3 text-sm text-cream-50/75">
      {loaded.status === "private" ? `${loaded.person?.name ?? "That player"}'s profile is private, so their stats can't be compared.` : loaded.status === "not_found" ? "Couldn't find that player." : "Couldn't load their stats. Try again."}</p>}
    {them && !them.stats && <p className="mt-3 text-sm text-cream-50/75">{them.person.name} hasn&apos;t finished any rounds yet.</p>}

    <div className={`mt-3 ${pillRow}`} role="group" aria-label="Stats to show">
      {METRICS.map((m) => <button key={m.key} type="button" aria-pressed={picked.includes(m.key)} onClick={() => toggle(m.key)}
        className={pill(picked.includes(m.key))}>{m.label}</button>)}
    </div>

    {them?.stats && <p className="mt-3 flex items-center gap-4 text-xs text-cream-50/80" aria-label="Legend">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ME }} /> You (outer)</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: THEM }} /> {firstName(them.person.name)} (inner)</span>
    </p>}
    {shown.length === 0 ? <p className="mt-3 text-sm text-cream-50/70">Pick a stat above.</p>
      : <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((m) => <Ring key={m.key} metric={m} me={m.value(mine)} them={them?.stats ? m.value(them.stats) : undefined} theirName={them ? firstName(them.person.name) : null} />)}
      </ul>}
  </section>;
}

/** One stat: outer arc = me, inner arc = them (if comparing). Numbers written below; "lower is better" noted. */
function Ring({ metric, me, them, theirName }: { metric: Metric; me: number | null; them: number | null | undefined; theirName: string | null }) {
  const arc = (r: number, value: number | null, color: string) => {
    const c = 2 * Math.PI * r;
    return <>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#1d0b11" strokeOpacity=".08" strokeWidth="8" />
      {value !== null && value > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(Math.min(value, 100) / 100) * c} ${c}`} transform="rotate(-90 50 50)" />}
    </>;
  };
  const comparing = them !== undefined;
  const better = comparing && me !== null && them !== null && me !== them ? (metric.lowerIsBetter ? me < them : me > them) : null;
  return <li className="flex flex-col items-center rounded-xl bg-cream-50 px-2 py-3 text-center">
    <svg viewBox="0 0 100 100" className="h-24 w-24" role="img" aria-label={`${metric.label}: you ${me ?? "no data"}%${comparing ? `, ${theirName} ${them ?? "no data"}%` : ""}`}>
      {arc(40, me, ME)}
      {comparing && arc(29, them ?? null, THEM)}
      <text x="50" y="55" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1d0b11">{me === null ? "—" : `${me}%`}</text>
    </svg>
    <span className="mt-1 text-xs font-semibold text-maroon-900">{metric.label}{metric.lowerIsBetter && <span className="font-normal text-maroon-900/55"> · lower is better</span>}</span>
    {comparing && <span className="mt-0.5 text-xs text-maroon-900/70">You {me ?? "—"}{me !== null && "%"} · {theirName} {them ?? "—"}{them != null && "%"}</span>}
    {better !== null && <span className={`mt-0.5 text-[11px] font-semibold ${better ? "text-maroon-700" : "text-maroon-900/55"}`}>{better ? "You lead" : `${theirName} leads`}</span>}
  </li>;
}
