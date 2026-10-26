"use client";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useRef } from "react";
import { roundStats, type RoundStats } from "@/lib/profile/roundStats";
import { sampleProfileRounds } from "@/lib/dev/sampleProfileRounds";
import { useSimulator } from "@/components/dev/SimulatorBridge";

/**
 * Profile → Stats → Compare (owner only): a ring per stat, my arc (outer, maroon) and a friend's (inner, amber) on the
 * same ring, with both numbers written under it. Pick who in one search box (tap it for my friends and people I've
 * played with; type to search every player, friends first), then which stats. Colours validated for colour-blind
 * separation; numbers are always written, never colour alone.
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
const pill = (on: boolean) => `min-h-[32.3px] flex-none whitespace-nowrap rounded-full border px-[15.3px] font-sans text-[12.75px] font-bold leading-none tracking-[.02em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#dcc495] ${on ? "border-[#dcc495] bg-[#dcc495] text-[var(--color-maroon-900)]" : "border-[rgba(220,196,149,.55)] bg-transparent text-[#dcc495]"}`;
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

  // On the profile's maroon background (no box): gold pills that scroll sideways, light text.
  return <section aria-label="Compare" className="mt-2 min-w-0 text-cream-50">
    <h3 className="m-0 font-condensed text-xs font-semibold uppercase tracking-[0.14em] text-gold-300">Compare</h3>

    <ComparePicker people={sampleOn ? [...people, SAMPLE] : people} query={query} onQuery={setQuery} found={found} chosen={"person" in loaded ? loaded.person ?? null : null}
      onPick={(p) => void compare(p)} onClear={() => { setLoaded({ status: "idle" }); setQuery(""); }} />

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

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/**
 * Who to compare with, in one box. Nobody picked: a search; tap it and my friends / people I've played with drop down,
 * type and it searches every player (friends first, no repeats). Somebody picked: "You vs <name>" with ✕ to change.
 */
function ComparePicker({ people, query, onQuery, found, chosen, onPick, onClear }: { people: Person[]; query: string; onQuery: (q: string) => void; found: Person[];
  chosen: Person | null; onPick: (p: Person) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const text = query.trim().toLowerCase();
  const matches = (p: Person) => p.name.toLowerCase().includes(text) || p.username.toLowerCase().includes(text.replace(/^@/, ""));
  const friends = text ? people.filter(matches) : people;
  const others = text.length >= 2 ? found.filter((p) => !friends.some((f) => f.username === p.username)) : [];
  const list = [...friends.map((p) => ({ ...p, friend: true })), ...others].slice(0, 8);
  const pick = (p: Person) => { setOpen(false); onPick(p); };

  if (chosen) return <div className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl border border-[rgba(220,196,149,.55)] px-3">
    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#dcc495] text-xs font-bold text-[var(--color-maroon-900)]" aria-hidden="true">{initials(chosen.name)}</span>
    <span className="min-w-0 flex-1 truncate text-sm"><span className="text-cream-50/70">You vs </span><b>{chosen.name}</b></span>
    <button type="button" onClick={() => { onClear(); window.setTimeout(() => input.current?.focus(), 0); }} className="grid h-9 w-9 flex-none place-items-center rounded-full text-cream-50/80 hover:bg-cream-50/10" aria-label="Compare with someone else"><X size={18} aria-hidden="true" /></button>
  </div>;

  return <div ref={box} className="relative mt-3" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
    <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[rgba(220,196,149,.55)] px-4 text-cream-50 focus-within:border-[#dcc495]">
      <Search size={17} aria-hidden="true" className="text-[#dcc495]" />
      <span className="sr-only">Find a player to compare with</span>
      <input ref={input} type="search" value={query} onFocus={() => setOpen(true)} onChange={(e) => { onQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { e.preventDefault(); pick(list[0]); } if (e.key === "Escape") setOpen(false); }}
        placeholder="Compare with a friend or any player" autoComplete="off" role="combobox" aria-expanded={open} aria-controls="compare-people"
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-cream-50/50" />
    </label>
    {open && <div id="compare-people" role="listbox" aria-label="Players" className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-2xl border border-[rgba(220,196,149,.35)] bg-[var(--color-maroon-950)] p-1 shadow-[0_14px_30px_rgba(0,0,0,.45)]">
      {!text && people.length > 0 && <p className="m-0 px-3 pb-1 pt-2 font-condensed text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-300">Your friends</p>}
      {list.map((p) => <button key={p.username} type="button" role="option" aria-selected={false} onClick={() => pick(p)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-cream-50/10 focus:bg-cream-50/10 focus:outline-none">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-cream-50/15 text-xs font-bold" aria-hidden="true">{initials(p.name)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-xs text-cream-50/55">@{p.username}</span></span>
        {p.friend && <span className="flex-none rounded-full border border-[rgba(220,196,149,.55)] px-2 py-0.5 text-[10px] font-semibold text-[#dcc495]">Friend</span>}
      </button>)}
      {!list.length && <p className="m-0 px-3 py-3 text-sm text-cream-50/70">{text.length < 2 ? (people.length ? "" : "Type a name or @username to find a player.") : `No players match "${query.trim()}".`}</p>}
    </div>}
  </div>;
}
