import type { PlayerRound, PlayerRoundHole } from "./playerRounds";

/**
 * Golf → Stats (owner request 2026-10-15): two views of the trip's saved rounds.
 * Course: every course played, ranked, plus its standout holes and 3-hole stretches. Individual: the best and worst
 * player for each stat (with everyone ranked). A hole only counts for a stat when it was recorded (blank = not tracked).
 */

export type TripRound = Pick<PlayerRound, "profileId" | "course" | "holes" | "total" | "holesPlayed">;

export interface HoleStat { course: string; hole: number; par: number; plays: number; avgToPar: number; birdies: number; bogeys: number }
export interface StretchStat { course: string; from: number; to: number; plays: number; avgToPar: number }
export interface CourseRank { course: string; rounds: number; avgToPar: number; avgScore: number; birdies: number }
export interface RoundHighlight { name: string; course: string; total: number; toPar: number }
export interface CourseInsights {
  courses: CourseRank[];
  mostBirdied: HoleStat | null; mostBogeyed: HoleStat | null; hardestHole: HoleStat | null; easiestHole: HoleStat | null;
  hardestStretch: StretchStat | null; easiestStretch: StretchStat | null;
  byPar: { par: 3 | 4 | 5; avgToPar: number | null }[];
  totals: { eagles: number; birdies: number; pars: number; bogeys: number; doubles: number };
  bestRound: RoundHighlight | null; worstRound: RoundHighlight | null;
}

/** One stat for the Individual view: everyone with enough holes, best first. `unit` formats the value. */
export interface PlayerStat { id: string; label: string; detail: string; unit: "toPar" | "pct" | "num"; ranking: { name: string; value: number }[] }

const toPar = (h: PlayerRoundHole) => h.strokes - h.par;
const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round2 = (n: number) => Math.round(n * 100) / 100;
const full = (r: TripRound) => r.holesPlayed === 18 && r.holes.length === 18;

export function courseInsights(rounds: TripRound[], nameOf: (id: string) => string): CourseInsights {
  const holeMap = new Map<string, { course: string; hole: number; par: number; scores: number[] }>();
  for (const r of rounds) for (const h of r.holes) {
    const key = `${r.course.name}#${h.number}`;
    const entry = holeMap.get(key) ?? { course: r.course.name, hole: h.number, par: h.par, scores: [] };
    entry.scores.push(toPar(h));
    holeMap.set(key, entry);
  }
  const holes: HoleStat[] = [...holeMap.values()].map((e) => ({ course: e.course, hole: e.hole, par: e.par, plays: e.scores.length,
    avgToPar: round2(avg(e.scores)!), birdies: e.scores.filter((s) => s < 0).length, bogeys: e.scores.filter((s) => s > 0).length }));
  const pick = <T,>(list: T[], better: (a: T, b: T) => number) => list.length ? [...list].sort(better)[0] : null;

  // 3-hole stretches: holes n, n+1, n+2 of the same round, averaged over every round played there.
  const stretchMap = new Map<string, { course: string; from: number; sums: number[] }>();
  for (const r of rounds) {
    const byNumber = new Map(r.holes.map((h) => [h.number, h]));
    for (const h of r.holes) {
      const b = byNumber.get(h.number + 1), c = byNumber.get(h.number + 2);
      if (!b || !c) continue;
      const key = `${r.course.name}#${h.number}`;
      const entry = stretchMap.get(key) ?? { course: r.course.name, from: h.number, sums: [] };
      entry.sums.push(toPar(h) + toPar(b) + toPar(c));
      stretchMap.set(key, entry);
    }
  }
  const stretches: StretchStat[] = [...stretchMap.values()].map((e) => ({ course: e.course, from: e.from, to: e.from + 2, plays: e.sums.length, avgToPar: round2(avg(e.sums)!) }));

  // Courses: average score to par per 18-hole round (9-hole rounds left out so courses compare fairly).
  const byCourse = new Map<string, TripRound[]>();
  for (const r of rounds.filter(full)) byCourse.set(r.course.name, [...(byCourse.get(r.course.name) ?? []), r]);
  const courses: CourseRank[] = [...byCourse].map(([course, list]) => ({ course, rounds: list.length,
    avgToPar: round2(avg(list.map((r) => r.holes.reduce((a, h) => a + toPar(h), 0)))!),
    avgScore: round2(avg(list.map((r) => r.total))!),
    birdies: list.reduce((a, r) => a + r.holes.filter((h) => toPar(h) < 0).length, 0) })).sort((a, b) => b.avgToPar - a.avgToPar);

  const all = rounds.flatMap((r) => r.holes);
  const scored = rounds.filter(full).map((r) => ({ name: nameOf(r.profileId), course: r.course.name, total: r.total, toPar: r.holes.reduce((a, h) => a + toPar(h), 0) }));
  return {
    courses,
    mostBirdied: pick(holes.filter((h) => h.birdies > 0), (a, b) => b.birdies / b.plays - a.birdies / a.plays || b.birdies - a.birdies),
    mostBogeyed: pick(holes.filter((h) => h.bogeys > 0), (a, b) => b.bogeys / b.plays - a.bogeys / a.plays || b.bogeys - a.bogeys),
    hardestHole: pick(holes, (a, b) => b.avgToPar - a.avgToPar),
    easiestHole: pick(holes, (a, b) => a.avgToPar - b.avgToPar),
    hardestStretch: pick(stretches, (a, b) => b.avgToPar - a.avgToPar),
    easiestStretch: pick(stretches, (a, b) => a.avgToPar - b.avgToPar),
    byPar: ([3, 4, 5] as const).map((par) => { const v = avg(all.filter((h) => h.par === par).map(toPar)); return { par, avgToPar: v === null ? null : round2(v) }; }),
    totals: { eagles: all.filter((h) => toPar(h) <= -2).length, birdies: all.filter((h) => toPar(h) === -1).length, pars: all.filter((h) => toPar(h) === 0).length,
      bogeys: all.filter((h) => toPar(h) === 1).length, doubles: all.filter((h) => toPar(h) >= 2).length },
    bestRound: pick(scored, (a, b) => a.toPar - b.toPar),
    worstRound: pick(scored, (a, b) => b.toPar - a.toPar),
  };
}

/**
 * Per-player stats, best first. Minimums so one lucky hole doesn't top a list: 3 chances for bounce back / fall off /
 * scrambling, 3 holes of a par type, 5 tracked holes for fairways / greens, one round with every putt for putts.
 */
export function playerStats(rounds: TripRound[], nameOf: (id: string) => string): PlayerStat[] {
  const byPlayer = new Map<string, TripRound[]>();
  for (const r of rounds) byPlayer.set(r.profileId, [...(byPlayer.get(r.profileId) ?? []), r]);
  type Row = { name: string; value: number | null };
  const rows: Record<string, Row[]> = {};
  const add = (id: string, name: string, value: number | null) => (rows[id] ??= []).push({ name, value });
  for (const [profileId, list] of byPlayer) {
    const name = nameOf(profileId);
    const holes = list.flatMap((r) => r.holes);
    const per18 = (count: number) => holes.length ? count / holes.length * 18 : null;
    for (const par of [3, 4, 5] as const) { const of = holes.filter((h) => h.par === par); add(`par${par}`, name, of.length >= 3 ? avg(of.map(toPar)) : null); }
    // Bounce back: birdie or better right after a bogey or worse. Fall off: bogey or worse right after a birdie or better.
    let bbChances = 0, bb = 0, foChances = 0, fo = 0, scrChances = 0, scr = 0;
    for (const r of list) r.holes.forEach((h, i) => {
      const next = r.holes[i + 1];
      if (next && toPar(h) > 0) { bbChances++; if (toPar(next) < 0) bb++; }
      if (next && toPar(h) < 0) { foChances++; if (toPar(next) > 0) fo++; }
      if (h.green && h.green !== "center") { scrChances++; if (toPar(h) <= 0) scr++; }
    });
    add("bounceBack", name, bbChances >= 3 ? bb / bbChances * 100 : null);
    add("fallOff", name, foChances >= 3 ? fo / foChances * 100 : null);
    add("scrambling", name, scrChances >= 3 ? scr / scrChances * 100 : null);
    const fw = holes.filter((h) => h.par !== 3 && h.fairway), gir = holes.filter((h) => h.green);
    add("fairways", name, fw.length >= 5 ? fw.filter((h) => h.fairway === "center").length / fw.length * 100 : null);
    add("gir", name, gir.length >= 5 ? gir.filter((h) => h.green === "center").length / gir.length * 100 : null);
    const puttRounds = list.filter((r) => r.holes.length > 0 && r.holes.every((h) => h.putts !== null));
    add("putts", name, puttRounds.length ? avg(puttRounds.map((r) => r.holes.reduce((a, h) => a + (h.putts ?? 0), 0) / r.holes.length * 18)) : null);
    const puttHoles = holes.filter((h) => h.putts !== null);
    add("threePutts", name, puttHoles.length >= 9 ? puttHoles.filter((h) => (h.putts ?? 0) >= 3).length / puttHoles.length * 18 : null);
    add("birdies", name, per18(holes.filter((h) => toPar(h) < 0).length));
    add("parOrBetter", name, holes.length ? holes.filter((h) => toPar(h) <= 0).length / holes.length * 100 : null);
    add("scoring", name, holes.length >= 9 ? avg(holes.map(toPar))! * 18 : null);
  }
  const defs: { id: string; label: string; detail: string; unit: PlayerStat["unit"]; higher: boolean }[] = [
    { id: "scoring", label: "Scoring average", detail: "To par per 18 holes", unit: "toPar", higher: false },
    { id: "par3", label: "Par 3s", detail: "Average to par", unit: "toPar", higher: false },
    { id: "par4", label: "Par 4s", detail: "Average to par", unit: "toPar", higher: false },
    { id: "par5", label: "Par 5s", detail: "Average to par", unit: "toPar", higher: false },
    { id: "bounceBack", label: "Bounce back", detail: "Birdie or better after a bogey or worse", unit: "pct", higher: true },
    { id: "fallOff", label: "Fall off", detail: "Bogey or worse after a birdie or better", unit: "pct", higher: false },
    { id: "fairways", label: "Fairways hit", detail: "Par 4s and 5s", unit: "pct", higher: true },
    { id: "gir", label: "GIR", detail: "Greens in regulation", unit: "pct", higher: true },
    { id: "putts", label: "Putts per round", detail: "Per 18 holes", unit: "num", higher: false },
    { id: "threePutts", label: "3-putts per round", detail: "Per 18 holes", unit: "num", higher: false },
    { id: "scrambling", label: "Scrambling", detail: "Par or better after missing the green", unit: "pct", higher: true },
    { id: "birdies", label: "Birdies per round", detail: "Birdie or better, per 18 holes", unit: "num", higher: true },
    { id: "parOrBetter", label: "Par or better", detail: "Share of holes", unit: "pct", higher: true },
  ];
  return defs.flatMap((d) => {
    const ranking = (rows[d.id] ?? []).filter((r): r is { name: string; value: number } => r.value !== null)
      .map((r) => ({ name: r.name, value: d.unit === "pct" ? Math.round(r.value) : round2(r.value) }))
      .sort((a, b) => d.higher ? b.value - a.value : a.value - b.value);
    return ranking.length ? [{ id: d.id, label: d.label, detail: d.detail, unit: d.unit, ranking }] : [];
  });
}
