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
  if (!stats.trip) return <p className={styles.empty}>Trip stats show once the first card is submitted.</p>;
  const names = new Map(stats.players.map((p) => [p.profileId, p.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const rounds = stats.rounds ?? [];
  const row = (key: string, name: string, s: TripStatsTotals, total = false) => <tr key={key} className={total ? styles.total : undefined}>
    <th scope="row">{name}</th><td>{s.rounds}</td><td>{s.scoringAvg}</td><td>{show(s.puttsAvg)}</td><td>{show(s.fairwayPct, "%")}</td><td>{show(s.greenPct, "%")}</td>
  </tr>;
  return <>
    <div className={styles.switch} role="tablist" aria-label="Stats view">
      {(["course", "individual"] as const).map((v) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>{v === "course" ? "Course" : "Individual"}</button>)}
    </div>
    {view === "course" ? <CourseView rounds={rounds} nameOf={nameOf} /> : <>
      <IndividualView rounds={rounds} nameOf={nameOf} />
      <h3 className={styles.heading}>All players</h3>
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th scope="col">Player</th><th scope="col">Rds</th><th scope="col">Avg</th><th scope="col">Putts</th><th scope="col">FWY</th><th scope="col">GIR</th></tr></thead>
        <tbody>{stats.players.map((p) => row(p.profileId, p.name, p))}{row("trip", "Trip", stats.trip, true)}</tbody>
      </table></div>
    </>}
    {changes.length > 0 && <section className={styles.changes} aria-label="Organizer's own score changes">
      <h3>Organizer&rsquo;s own score changes</h3>
      <ul>{changes.map(({ name, edit }, i) => <li key={i}>{name}, hole {edit.hole} {edit.field}: {String(edit.from ?? "—")} → {String(edit.to ?? "—")}. {edit.reason}</li>)}</ul>
    </section>}
  </>;
}

const holeLine = (h: HoleStat) => `${h.course} · Hole ${h.hole} (par ${h.par})`;
const stretchLine = (s: StretchStat) => `${s.course} · Holes ${s.from}–${s.to}`;

function CourseView({ rounds, nameOf }: { rounds: TripRound[]; nameOf: (id: string) => string }) {
  const c = courseInsights(rounds, nameOf);
  const tiles: { label: string; main: string; sub: string; tone?: "hard" | "easy" }[] = [
    ...(c.hardestHole ? [{ label: "Hardest hole", main: toPar(c.hardestHole.avgToPar), sub: holeLine(c.hardestHole), tone: "hard" as const }] : []),
    ...(c.easiestHole ? [{ label: "Easiest hole", main: toPar(c.easiestHole.avgToPar), sub: holeLine(c.easiestHole), tone: "easy" as const }] : []),
    ...(c.mostBirdied ? [{ label: "Most birdied hole", main: `${c.mostBirdied.birdies} of ${c.mostBirdied.plays}`, sub: holeLine(c.mostBirdied), tone: "easy" as const }] : []),
    ...(c.mostBogeyed ? [{ label: "Most bogeyed hole", main: `${c.mostBogeyed.bogeys} of ${c.mostBogeyed.plays}`, sub: holeLine(c.mostBogeyed), tone: "hard" as const }] : []),
    ...(c.hardestStretch ? [{ label: "Hardest 3-hole stretch", main: toPar(c.hardestStretch.avgToPar), sub: stretchLine(c.hardestStretch), tone: "hard" as const }] : []),
    ...(c.easiestStretch ? [{ label: "Easiest 3-hole stretch", main: toPar(c.easiestStretch.avgToPar), sub: stretchLine(c.easiestStretch), tone: "easy" as const }] : []),
    ...(c.bestRound ? [{ label: "Best round", main: `${c.bestRound.total} (${toPar(c.bestRound.toPar, 0)})`, sub: `${c.bestRound.name} · ${c.bestRound.course}`, tone: "easy" as const }] : []),
    ...(c.worstRound ? [{ label: "Toughest round", main: `${c.worstRound.total} (${toPar(c.worstRound.toPar, 0)})`, sub: `${c.worstRound.name} · ${c.worstRound.course}`, tone: "hard" as const }] : []),
  ];
  const t = c.totals, totalHoles = t.eagles + t.birdies + t.pars + t.bogeys + t.doubles;
  return <>
    {c.courses.length > 0 && <section aria-label="Courses ranked">
      <h3 className={styles.heading}>Courses, hardest first</h3>
      <ol className={styles.ranked}>
        {c.courses.map((course, i) => <li key={course.course}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.rankName}>{course.course}<small>{course.rounds} rounds · avg {course.avgScore.toFixed(1)} · {course.birdies} birdies</small></span>
          <b>{toPar(course.avgToPar, 1)}</b>
        </li>)}
      </ol>
      {c.courses.length > 1 && <p className={styles.note}>Hardest: <b>{c.courses[0].course}</b> · Easiest: <b>{c.courses.at(-1)!.course}</b> (average to par per round)</p>}
    </section>}
    <div className={styles.tiles}>
      {tiles.map((tile) => <div key={tile.label} className={styles.tile} data-tone={tile.tone}>
        <span className={styles.tileLabel}>{tile.label}</span>
        <b className={styles.tileMain}>{tile.main}</b>
        <span className={styles.tileSub}>{tile.sub}</span>
      </div>)}
    </div>
    <h3 className={styles.heading}>Scoring by par</h3>
    <div className={styles.parRow}>
      {c.byPar.map((p) => <div key={p.par}><small>Par {p.par}s</small><b>{p.avgToPar === null ? "—" : toPar(p.avgToPar)}</b></div>)}
    </div>
    {totalHoles > 0 && <>
      <h3 className={styles.heading}>Every hole on the trip ({totalHoles})</h3>
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

function IndividualView({ rounds, nameOf }: { rounds: TripRound[]; nameOf: (id: string) => string }) {
  const list = playerStats(rounds, nameOf);
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return <p className={styles.empty}>Individual stats show once players have a few holes recorded.</p>;
  return <div className={styles.leaders}>
    {list.map((s) => {
      const best = s.ranking[0], worst = s.ranking.at(-1)!;
      const expanded = open === s.id;
      return <section key={s.id} className={styles.leader} aria-label={s.label}>
        <button type="button" className={styles.leaderHead} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)}>
          <span><b>{s.label}</b><small>{s.detail}</small></span>
          <span className={styles.chev} aria-hidden>{expanded ? "−" : "+"}</span>
        </button>
        {!expanded ? <div className={styles.bestWorst}>
          <div data-tone="easy"><small>Best</small><span>{best.name}</span><b>{value(s.unit, best.value)}</b></div>
          {s.ranking.length > 1 && <div data-tone="hard"><small>Worst</small><span>{worst.name}</span><b>{value(s.unit, worst.value)}</b></div>}
        </div> : <ol className={styles.ranked}>
          {s.ranking.map((r, i) => <li key={r.name}><span className={styles.rank}>{i > 0 && s.ranking[i - 1].value === r.value ? "" : i + 1}</span><span className={styles.rankName}>{r.name}</span><b>{value(s.unit, r.value)}</b></li>)}
        </ol>}
      </section>;
    })}
  </div>;
}
