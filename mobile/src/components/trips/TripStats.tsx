import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ScoreEdit } from "@/lib/platform/playerRounds";
import { courseInsights, playerStats, type HoleStat, type PlayerStat, type StretchStat, type TripRound } from "@/lib/platform/tripInsights";
import type { TripStatsRow, TripStatsTotals } from "@/lib/platform/tripStats";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/**
 * Golf → Stats in the app (website GolfTripStats, project_specs.md Golf Trips part 2d slice 2): the trip's stats from
 * saved rounds only, in two views, Course (courses ranked, standout holes and stretches, by par, every hole) and
 * Individual (best / worst per stat, tap for everyone, then every player's totals and rounds), plus the organizer's
 * own score changes. Same shared maths as the website (lib/platform/tripInsights.ts). Nothing is filled in from samples.
 */
export type TripStatsView = { players: (TripStatsRow & { name: string })[]; trip: TripStatsTotals | null; rounds?: TripRound[] };
export type ScoreChangeLine = { name: string; edit: ScoreEdit };

const toPar = (n: number, decimals = 2) => { const v = Number(n.toFixed(decimals)); return v === 0 ? "E" : v > 0 ? `+${v}` : String(v); };
const value = (unit: PlayerStat["unit"], n: number) => unit === "pct" ? `${n}%` : unit === "toPar" ? toPar(n, Math.abs(n) >= 3 ? 1 : 2) : n.toFixed(1);
const shortCourse = (name: string) => name.split(/\s+/).slice(0, 2).join(" ");
const first = (name: string) => name.split(/\s+/)[0];
const holeLine = (h: HoleStat) => `${shortCourse(h.course)} #${h.hole}`;
const stretchLine = (s: StretchStat) => `${shortCourse(s.course)} #${s.from}–${s.to}`;
const one = (n: number | null) => n === null ? "—" : n.toFixed(1);
const show = (n: number | null, suffix = "") => n === null ? "—" : `${n}${suffix}`;

/** `stats`: undefined = the trip has no recorded rounds to show yet (live trips until cards are submitted). */
export function TripStats({ stats, changes = [], spectator = false }: { stats: TripStatsView | undefined; changes?: ScoreChangeLine[]; spectator?: boolean }) {
  const [view, setView] = useState<"course" | "individual">("course");
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  if (!stats) return <Box title="Stats"><Text style={styles.muted}>Stats will show here once players record rounds.</Text></Box>;
  if (!stats.trip) return <Box title={spectator ? "Round Stats" : "Trip Stats"}><Text style={styles.muted}>Trip stats show once the first card is submitted.</Text></Box>;
  const names = new Map(stats.players.map((p) => [p.profileId, p.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  const rounds = stats.rounds ?? [];
  const totalsRow = (key: string, name: string, s: TripStatsTotals, total = false) => (
    <Pressable key={key} accessibilityRole={total ? "text" : "button"} accessibilityState={total ? undefined : { expanded: openPlayer === key }} disabled={total}
      onPress={() => setOpenPlayer(openPlayer === key ? null : key)} style={[styles.tr, total && styles.totalRow]}>
      <Text style={[styles.th, total && { color: colors.goldBright }]} numberOfLines={1}>{name}</Text>
      {[String(s.rounds), one(s.scoringAvg), one(s.puttsAvg), show(s.fairwayPct, "%"), show(s.greenPct, "%")].map((cell, i) => <Text key={i} style={styles.td}>{cell}</Text>)}
    </Pressable>
  );
  const roundsOf = (id: string) => rounds.filter((r) => r.profileId === id).map((r, i) => {
    const toParN = r.holes.reduce((a, h) => a + h.strokes - h.par, 0);
    const putts = r.holes.length && r.holes.every((h) => h.putts !== null) ? r.holes.reduce((a, h) => a + (h.putts ?? 0), 0) : null;
    const fw = r.holes.filter((h) => h.par !== 3 && h.fairway), gir = r.holes.filter((h) => h.green);
    const pctOf = (list: typeof r.holes, hit: (h: (typeof r.holes)[number]) => boolean) => list.length ? `${Math.round(list.filter(hit).length / list.length * 100)}%` : "—";
    return <View key={`${id}:${i}`} style={[styles.tr, styles.roundRow]}>
      <Text style={[styles.th, styles.roundName]} numberOfLines={1}>{shortCourse(r.course.name)} {toPar(toParN, 0)}</Text>
      {["", String(r.total), putts === null ? "—" : String(putts), pctOf(fw, (h) => h.fairway === "center"), pctOf(gir, (h) => h.green === "center")].map((cell, j) => <Text key={j} style={styles.td}>{cell}</Text>)}
    </View>;
  });
  return (
    <Box title={spectator ? "Round Stats" : "Trip Stats"}>
      <View style={styles.switch} accessibilityRole="tablist" accessibilityLabel="Stats view">
        {(["course", "individual"] as const).map((v) => <Pressable key={v} accessibilityRole="tab" accessibilityState={{ selected: view === v }} onPress={() => setView(v)} style={[styles.switchItem, view === v && styles.on]}>
          <Text style={[styles.switchText, view === v && styles.onText]}>{v === "course" ? "Course" : "Individual"}</Text>
        </Pressable>)}
      </View>
      {view === "course" ? <CourseView rounds={rounds} nameOf={nameOf} /> : <>
        <IndividualView rounds={rounds} nameOf={nameOf} />
        <Text style={styles.heading}>All players</Text>
        <View style={styles.tr}>{["Player", "Rds", "Avg", "Putts", "FWY", "GIR"].map((h, i) => <Text key={h} style={[i ? styles.td : styles.th, styles.headCell]}>{h}</Text>)}</View>
        {stats.players.flatMap((p) => [totalsRow(p.profileId, p.name, p), ...(openPlayer === p.profileId ? roundsOf(p.profileId) : [])])}
        {totalsRow("trip", "Trip", stats.trip, true)}
      </>}
      {changes.length > 0 && <View accessibilityLabel="Organizer's own score changes" style={{ gap: 4 }}>
        <Text style={styles.heading}>Organizer’s own score changes</Text>
        {changes.map(({ name, edit }, i) => <Text key={i} style={styles.muted}>{name}, hole {edit.hole} {edit.field}: {String(edit.from ?? "—")} → {String(edit.to ?? "—")}. {edit.reason}</Text>)}
      </View>}
    </Box>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.box}><Text style={styles.title}>{title}</Text>{children}</View>;
}

function CourseView({ rounds, nameOf }: { rounds: TripRound[]; nameOf: (id: string) => string }) {
  const c = courseInsights(rounds, nameOf);
  const tiles: { label: string; main: string; sub: string; hard: boolean }[] = [
    ...(c.hardestHole ? [{ label: "Hardest hole", main: toPar(c.hardestHole.avgToPar), sub: holeLine(c.hardestHole), hard: true }] : []),
    ...(c.easiestHole ? [{ label: "Easiest hole", main: toPar(c.easiestHole.avgToPar), sub: holeLine(c.easiestHole), hard: false }] : []),
    ...(c.mostBirdied ? [{ label: "Most birdies", main: `${c.mostBirdied.birdies} of ${c.mostBirdied.plays}`, sub: holeLine(c.mostBirdied), hard: false }] : []),
    ...(c.mostBogeyed ? [{ label: "Most bogeys", main: `${c.mostBogeyed.bogeys} of ${c.mostBogeyed.plays}`, sub: holeLine(c.mostBogeyed), hard: true }] : []),
    ...(c.hardestStretch ? [{ label: "Hardest stretch", main: toPar(c.hardestStretch.avgToPar), sub: stretchLine(c.hardestStretch), hard: true }] : []),
    ...(c.easiestStretch ? [{ label: "Easiest stretch", main: toPar(c.easiestStretch.avgToPar), sub: stretchLine(c.easiestStretch), hard: false }] : []),
    ...(c.bestRound ? [{ label: "Best round", main: `${c.bestRound.total} (${toPar(c.bestRound.toPar, 0)})`, sub: `${first(c.bestRound.name)} · ${shortCourse(c.bestRound.course)}`, hard: false }] : []),
    ...(c.worstRound ? [{ label: "Toughest round", main: `${c.worstRound.total} (${toPar(c.worstRound.toPar, 0)})`, sub: `${first(c.worstRound.name)} · ${shortCourse(c.worstRound.course)}`, hard: true }] : []),
  ];
  const t = c.totals, mix = [["Eagles+", t.eagles, colors.goldBright], ["Birdies", t.birdies, "#e8a33d"], ["Pars", t.pars, colors.boardInk], ["Bogeys", t.bogeys, colors.maroon500], ["Doubles+", t.doubles, colors.errorOnMaroon]] as const;
  const totalHoles = mix.reduce((a, [, n]) => a + n, 0);
  return <View style={{ gap: 10 }}>
    {c.courses.length > 0 && <>
      <Text style={styles.heading}>Courses · hardest first</Text>
      {c.courses.map((course, i) => <View key={course.course} style={styles.ranked}><Text style={styles.rank}>{i + 1}</Text><Text style={styles.rankName} numberOfLines={1}>{course.course}</Text><Text style={styles.rankValue}>{toPar(course.avgToPar, 1)}</Text></View>)}
    </>}
    <View style={styles.tiles}>
      {tiles.map((tile) => <View key={tile.label} style={styles.tile}>
        <Text style={styles.label}>{tile.label}</Text>
        <Text style={[styles.tileMain, { color: tile.hard ? colors.errorOnMaroon : colors.goldBright }]}>{tile.main}</Text>
        <Text style={styles.muted} numberOfLines={1}>{tile.sub}</Text>
      </View>)}
    </View>
    <Text style={styles.heading}>By par</Text>
    <View style={{ flexDirection: "row" }}>{c.byPar.map((p) => <View key={p.par} style={{ flex: 1, alignItems: "center" }}><Text style={styles.label}>Par {p.par}s</Text><Text style={styles.rankValue}>{p.avgToPar === null ? "—" : toPar(p.avgToPar)}</Text></View>)}</View>
    {totalHoles > 0 && <>
      <Text style={styles.heading}>Every hole</Text>
      <View style={styles.mix} accessibilityLabel={mix.map(([l, n]) => `${l} ${n}`).join(", ")}>{mix.map(([l, n, color]) => n > 0 && <View key={l} style={{ flexGrow: n, backgroundColor: color }} />)}</View>
      <View style={styles.legend}>{mix.map(([l, n, color]) => <View key={l} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.muted}>{l} <Text style={{ fontFamily: fonts.bold, color: colors.cream }}>{n}</Text></Text></View>)}</View>
    </>}
  </View>;
}

function IndividualView({ rounds, nameOf }: { rounds: TripRound[]; nameOf: (id: string) => string }) {
  const list = playerStats(rounds, nameOf);
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return <Text style={styles.muted}>Individual stats show once players have a few holes recorded.</Text>;
  return <View style={{ gap: 6 }}>
    {list.map((s) => {
      const best = s.ranking[0], worst = s.ranking.at(-1)!, expanded = open === s.id;
      return <View key={s.id} style={styles.leader}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : s.id)} style={styles.leaderHead}>
          <Text style={[styles.rankName, { flex: 1 }]}>{s.label}</Text>
          {!expanded && <Text style={[styles.muted, { color: colors.goldBright }]}>{first(best.name)} {value(s.unit, best.value)}</Text>}
          {!expanded && s.ranking.length > 1 && <Text style={[styles.muted, { color: colors.errorOnMaroon }]}>{first(worst.name)} {value(s.unit, worst.value)}</Text>}
        </Pressable>
        {expanded && s.ranking.map((r, i) => <View key={r.name} style={styles.ranked}>
          <Text style={styles.rank}>{i > 0 && s.ranking[i - 1].value === r.value ? "" : i + 1}</Text><Text style={styles.rankName}>{r.name}</Text><Text style={styles.rankValue}>{value(s.unit, r.value)}</Text>
        </View>)}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  box: { marginHorizontal: gutter, padding: 14, gap: 10, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  heading: { marginTop: 6, fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  switch: { flexDirection: "row", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, padding: 3 },
  switchItem: { flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  switchText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk },
  on: { backgroundColor: colors.goldBright },
  onText: { color: colors.maroon900 },
  ranked: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  rank: { width: 20, fontFamily: fonts.bold, fontSize: 13, color: colors.boardGold },
  rankName: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  rankValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream, fontVariant: ["tabular-nums"] },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "48%", flexGrow: 1, padding: 10, gap: 2, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  tileMain: { fontFamily: fonts.bold, fontSize: 20 },
  mix: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  leader: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  leaderHead: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: minTap },
  tr: { flexDirection: "row", alignItems: "center", minHeight: 36, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  th: { flex: 2, fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  td: { flex: 1, textAlign: "center", fontFamily: fonts.regular, fontSize: 13, color: colors.cream, fontVariant: ["tabular-nums"] },
  headCell: { fontFamily: fonts.capsSemibold, fontSize: 11, color: colors.boardGold, textTransform: "uppercase" },
  totalRow: { borderTopColor: colors.boardBorderSoft },
  roundRow: { minHeight: 30 },
  roundName: { paddingLeft: 10, fontFamily: fonts.regular, color: colors.boardInk },
});
