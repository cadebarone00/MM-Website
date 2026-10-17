"use client";
import { useState } from "react";
import type { ScoreEdit } from "@/lib/platform/playerRounds";
import type { TripStatsRow, TripStatsTotals } from "@/lib/platform/tripStats";
import { courseInsights, playerStats, type HoleStat, type PlayerStat, type StretchStat, type TripRound } from "@/lib/platform/tripInsights";
import styles from "./GolfTripStats.module.css";

/** `rounds`: the trip's saved rounds, for the Course / Individual views. */
export type TripStatsView = { players: (TripStatsRow & { name: string })[]; trip: TripStatsTotals | null; rounds?: TripRound[] };
export type ScoreChangeLine = { name: string; edit: ScoreEdit };

const show = (value: number | null, suffix = "") => value === null ? "—" : `${value}${suffix}`;
const toPar = (n: number, decimals = 2) => { const v = Number(n.toFixed(decimals)); return v === 0 ? "E" : v > 0 ? `+${v}` : String(v); };
/** Per-round numbers (e.g. +13.7) with one decimal; per-hole averages (e.g. +0.83) with two. */
const value = (unit: PlayerStat["unit"], n: number) => unit === "pct" ? `${n}%` : unit === "toPar" ? toPar(n, Math.abs(n) >= 3 ? 1 : 2) : n.toFixed(1);

/**
 * Golf → Stats: the trip's stats from the saved rounds (Player & Attest add-on), in two views (owner request
 * 2026-10-15) — Course (courses ranked, standout holes and stretches) and Individual (best / worst player per stat, tap
 * for everyone) — and the organizer's changes to their own round, which everyone on the trip can see (decision 9).
 */
export function GolfTripStats({ stats, changes = [] }: { stats: TripStatsView; changes?: ScoreChangeLine[] }) {
  const [view, setView] = useState<"course" | "individual">("course");
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  if (!stats.trip) return <p className={styles.empty}>Trip stats show once the first card is submitted.</p>;
  const names = new Map(stats.players.map((p) => [p.profileId, p.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const rounds = stats.rounds ?? [];
  const one = (n: number | null) => n === null ? "—" : n.toFixed(1);
  const row = (key: string, name: string, s: TripStatsTotals, total = false) => <tr key={key} className={total ? styles.total : undefined}>
    <th scope="row">{total ? name : <button type="button" className={styles.playerButton} aria-expanded={openPlayer === key} onClick={() => setOpenPlayer(openPlayer === key ? null : key)}>{name}</button>}</th>
    <td>{s.rounds}</td><td>{one(s.scoringAvg)}</td><td>{one(s.puttsAvg)}</td><td>{show(s.fairwayPct, "%")}</td><td>{show(s.greenPct, "%")}</td>
  </tr>;
  // A player's rounds, one line each (owner request 2026-10-17).
  const roundsOf = (id: string) => <tr key={id + ":rounds"} className={styles.roundsRow}><td colSpan={6}>
    <table className={styles.roundsTable}><tbody>
      {rounds.filter((r) => r.profileId === id).map((r, i) => {
        const toParN = r.holes.reduce((a, h) => a + h.strokes - h.par, 0);
        const putts = r.holes.every((h) => h.putts !== null) && r.holes.length ? r.holes.reduce((a, h) => a + (h.putts ?? 0), 0) : null;
        const fw = r.holes.filter((h) => h.par !== 3 && h.fairway), gir = r.holes.filter((h) => h.green);
        const pctOf = (list: typeof r.holes, hit: (h: (typeof r.holes)[number]) => boolean) => list.length ? `${Math.round(list.filter(hit).length / list.length * 100)}%` : "—";
        return <tr key={i}><th scope="row">{shortCourse(r.course.name)}</th><td>{r.total}</td><td>{toPar(toParN, 0)}</td><td>{putts ?? "—"}</td>
          <td>{pctOf(fw, (h) => h.fairway === "center")}</td><td>{pctOf(gir, (h) => h.green === "center")}</td></tr>;
      })}
    </tbody></table>
  </td></tr>;
  return <>
    <div className={styles.switch} role="tablist" aria-label="Stats view">
      {(["course", "individual"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>{v === "course" ? "Course" : "Individual"}</button>)}
    </div>
    {view === "course" ? <CourseView rounds={rounds} nameOf={nameOf} /> : <>
      <IndividualView rounds={rounds} nameOf={nameOf} />
      <h3 className={styles.heading}>All players</h3>
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th scope="col">Player</th><th scope="col">Rds</th><th scope="col">Avg</th><th scope="col">Putts</th><th scope="col">FWY</th><th scope="col">GIR</th></tr></thead>
        <tbody>{stats.players.flatMap((p) => [row(p.profileId, p.name, p), ...(openPlayer === p.profileId ? [roundsOf(p.profileId)] : [])])}{row("trip", "Trip", stats.trip, true)}</tbody>
      </table></div>
    </>}
    {changes.length > 0 && <section className={styles.changes} aria-label="Organizer's own score changes">
      <h3>Organizer&rsquo;s own score changes</h3>
      <ul>{changes.map(({ name, edit }, i) => <li key={i}>{name}, hole {edit.hole} {edit.field}: {String(edit.from ?? "—")} → {String(edit.to ?? "—")}. {edit.reason}</li>)}</ul>
    </section>}
  </>;
}

/** "PGA West Stadium" → "PGA West": the first two words, enough to tell the trip's courses apart. */
const shortCourse = (name: string) => name.split(/\s+/).slice(0, 2).join(" ");
const first = (name: string) => name.split(/\s+/)[0];
const holeLine = (h: HoleStat) => `${shortCourse(h.course)} #${h.hole}`;
const stretchLine = (s: StretchStat) => `${shortCourse(s.course)} #${s.from}–${s.to}`;

function CourseView({ rounds, nameOf }: { rounds: TripRound[]; nameOf: (id: string) => string }) {
  const c = courseInsights(rounds, nameOf);
  const tiles: { label: string; main: string; sub: string; tone?: "hard" | "easy" }[] = [
    ...(c.hardestHole ? [{ label: "Hardest hole", main: toPar(c.hardestHole.avgToPar), sub: holeLine(c.hardestHole), tone: "hard" as const }] : []),
    ...(c.easiestHole ? [{ label: "Easiest hole", main: toPar(c.easiestHole.avgToPar), sub: holeLine(c.easiestHole), tone: "easy" as const }] : []),
    ...(c.mostBirdied ? [{ label: "Most birdies", main: `${c.mostBirdied.birdies} of ${c.mostBirdied.plays}`, sub: holeLine(c.mostBirdied), tone: "easy" as const }] : []),
    ...(c.mostBogeyed ? [{ label: "Most bogeys", main: `${c.mostBogeyed.bogeys} of ${c.mostBogeyed.plays}`, sub: holeLine(c.mostBogeyed), tone: "hard" as const }] : []),
    ...(c.hardestStretch ? [{ label: "Hardest stretch", main: toPar(c.hardestStretch.avgToPar), sub: stretchLine(c.hardestStretch), tone: "hard" as const }] : []),
    ...(c.easiestStretch ? [{ label: "Easiest stretch", main: toPar(c.easiestStretch.avgToPar), sub: stretchLine(c.easiestStretch), tone: "easy" as const }] : []),
    ...(c.bestRound ? [{ label: "Best round", main: `${c.bestRound.total} (${toPar(c.bestRound.toPar, 0)})`, sub: `${first(c.bestRound.name)} · ${shortCourse(c.bestRound.course)}`, tone: "easy" as const }] : []),
    ...(c.worstRound ? [{ label: "Toughest round", main: `${c.worstRound.total} (${toPar(c.worstRound.toPar, 0)})`, sub: `${first(c.worstRound.name)} · ${shortCourse(c.worstRound.course)}`, tone: "hard" as const }] : []),
  ];
  const t = c.totals, totalHoles = t.eagles + t.birdies + t.pars + t.bogeys + t.doubles;
  return <>
    {c.courses.length > 0 && <section aria-label="Courses ranked">
      <h3 className={styles.heading}>Courses · hardest first</h3>
      <ol className={styles.ranked}>
        {c.courses.map((course, i) => <li key={course.course}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.rankName}>{course.course}</span>
          <b>{toPar(course.avgToPar, 1)}</b>
        </li>)}
      </ol>
    </section>}
    <div className={styles.tiles}>
      {tiles.map((tile) => <div key={tile.label} className={styles.tile} data-tone={tile.tone}>
        <span className={styles.tileLabel}>{tile.label}</span>
        <b className={styles.tileMain}>{tile.main}</b>
        <span className={styles.tileSub}>{tile.sub}</span>
      </div>)}
    </div>
    <h3 className={styles.heading}>By par</h3>
    <div className={styles.parRow}>
      {c.byPar.map((p) => <div key={p.par}><small>Par {p.par}s</small><b>{p.avgToPar === null ? "—" : toPar(p.avgToPar)}</b></div>)}
    </div>
    {totalHoles > 0 && <>
      <h3 className={styles.heading}>Every hole</h3>
      <div className={styles.mix} role="img" aria-label={`Eagles ${t.eagles}, birdies ${t.birdies}, pars ${t.pars}, bogeys ${t.bogeys}, doubles or worse ${t.doubles}`}>
        {([["eagle", t.eagles], ["birdie", t.birdies], ["par", t.pars], ["bogey", t.bogeys], ["double", t.doubles]] as const).map(([k, n]) => n > 0 && <span key={k} data-kind={k} style={{ flexGrow: n }} />)}
      </div>
      <ul className={styles.mixLegend}>
        {([["eagle", "Eagles+", t.eagles], ["birdie", "Birdies", t.birdies], ["par", "Pars", t.pars], ["bogey", "Bogeys", t.bogeys], ["double", "Doubles+", t.doubles]] as const).map(([k, label, n]) =>
          <li key={k}><i data-kind={k} />{label} <b>{n}</b></li>)}
      </ul>
    </>}
  </>;
}

/** Stats whose name doesn't explain itself get a small "i". */
const EXPLAIN = new Set(["bounceBack", "fallOff", "scrambling"]);

function IndividualView({ rounds, nameOf }: { rounds: TripRound[]; nameOf: (id: string) => string }) {
  const list = playerStats(rounds, nameOf);
  const [open, setOpen] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  if (!list.length) return <p className={styles.empty}>Individual stats show once players have a few holes recorded.</p>;
  return <div className={styles.leaders}>
    {list.map((s) => {
      const best = s.ranking[0], worst = s.ranking.at(-1)!;
      const expanded = open === s.id;
      return <section key={s.id} className={styles.leader} aria-label={s.label}>
        <div className={styles.leaderRow}>
          <button type="button" className={styles.leaderHead} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)}>
            <b>{s.label}</b>
            {!expanded && <span className={styles.bw} data-tone="easy">{first(best.name)} <em>{value(s.unit, best.value)}</em></span>}
            {!expanded && s.ranking.length > 1 && <span className={styles.bw} data-tone="hard">{first(worst.name)} <em>{value(s.unit, worst.value)}</em></span>}
          </button>
          {EXPLAIN.has(s.id) && <button type="button" className={styles.info} aria-label={`What is ${s.label}?`} aria-expanded={info === s.id} onClick={() => setInfo(info === s.id ? null : s.id)}>i</button>}
        </div>
        {info === s.id && <p className={styles.infoText}>{s.detail}.</p>}
        {expanded && <ol className={styles.ranked}>
          {s.ranking.map((r, i) => <li key={r.name}><span className={styles.rank}>{i > 0 && s.ranking[i - 1].value === r.value ? "" : i + 1}</span><span className={styles.rankName}>{r.name}</span><b>{value(s.unit, r.value)}</b></li>)}
        </ol>}
      </section>;
    })}
  </div>;
}
