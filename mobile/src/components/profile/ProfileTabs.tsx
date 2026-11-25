import { useMemo, useState } from "react";
import { router } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nineHolePairs } from "@/lib/platform/playerRounds";
import { scoreMark } from "@/lib/platform/roundBoard";
import { roundStats } from "@/lib/profile/roundStats";
import { SheetClose } from "~/components/SheetClose.tsx";
import type { ProfileHistoryRound, ProfileModel, ProfileTrip } from "~/lib/profileTypes.ts";
import { NAMED_SOURCES, profileDay, ROUND_LETTER, roundsLabel, roundToPar, sheetDifferential, underScore } from "~/lib/profileUi.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

/** A trip's link on a profile ("/golf-trips/<id>" or "?id=") → the app's trip screen. */
function tripIdFrom(href: string): string | null {
  return /[?&]id=([0-9a-f-]{36})/i.exec(href)?.[1] ?? /\/golf-trips\/([0-9a-f-]{36})/i.exec(href)?.[1] ?? null;
}

/** Profile → Overview (website ProfileHistory): Tournaments (with that year's team) and Golf trips. */
export function OverviewTab({ profile }: { profile: ProfileModel }) {
  const { trips, tournaments, teamHistory, isOwner } = profile;
  if (trips.status === "hidden" && tournaments.status === "hidden") return null;
  const legacy = teamHistory.filter((e) => e.source === "legacy");
  const allTrips: { trip: ProfileTrip; past: boolean }[] = trips.status === "ok" ? [...trips.value.current.map((trip) => ({ trip, past: false })), ...trips.value.past.map((trip) => ({ trip, past: true }))] : [];
  return (
    <View style={styles.darkSection}>
      {tournaments.status !== "hidden" && (
        <>
          <Text style={styles.heading}>TOURNAMENTS</Text>
          {tournaments.status === "unavailable" && !legacy.length ? <Text style={styles.muted}>Tournaments can&apos;t be loaded right now.</Text>
            : tournaments.status === "ok" && !tournaments.value.length && !legacy.length ? <Text style={styles.muted}>{isOwner ? "Tournaments you play in will show here." : "No public tournaments yet."}</Text>
            : (
              <>
                {tournaments.status === "ok" && tournaments.value.map((t) => (
                  <View key={t.href} style={styles.row}>
                    <Text style={styles.rowTitle}>{t.year} · {t.name}</Text>
                    {t.team ? <Text style={styles.rowSub}>{t.team.name}{t.isCaptain ? " · Captain" : ""}</Text> : null}
                  </View>
                ))}
                {legacy.map((e) => (
                  <View key={`legacy-${e.year}`} style={styles.row}><Text style={styles.rowTitle}>{e.year} · {e.tournament}</Text><Text style={styles.rowSub}>{e.team}</Text></View>
                ))}
              </>
            )}
        </>
      )}
      {trips.status !== "hidden" && (
        <>
          <Text style={[styles.heading, styles.headingGap]}>GOLF TRIPS</Text>
          {trips.status === "unavailable" ? <Text style={styles.muted}>Golf trips can&apos;t be loaded right now.</Text>
            : !allTrips.length ? <Text style={styles.muted}>Golf trips you join will show here.</Text>
            : allTrips.map(({ trip, past }) => {
              const id = tripIdFrom(trip.href);
              const dates = [profileDay(trip.startDate), profileDay(trip.endDate)].filter(Boolean).join(" – ");
              return (
                <Pressable key={trip.href} disabled={!id} accessibilityRole="button" onPress={() => id && router.push({ pathname: "/trips/[id]", params: { id, name: trip.name } })} style={styles.row}>
                  <Text style={styles.rowTitle}>{trip.name}</Text>
                  <Text style={styles.rowSub}>{[trip.destination, dates || null, past ? "Past" : null].filter(Boolean).join(" · ")}</Text>
                </Pressable>
              );
            })}
        </>
      )}
    </View>
  );
}

/** Profile → Rounds (website PlayerRoundsList): newest first; tap a round for its sheet. */
export function RoundsTab({ profile }: { profile: ProfileModel }) {
  const [open, setOpen] = useState<ProfileHistoryRound | null>(null);
  const rounds = profile.rounds.status === "ok" ? profile.rounds.value : [];
  const pairs = useMemo(() => nineHolePairs(rounds), [rounds]);
  if (profile.rounds.status === "unavailable") return <View style={styles.darkSection}><Text style={styles.muted}>Rounds can&apos;t be loaded right now.</Text></View>;
  return (
    <View style={styles.darkSection}>
      <Text style={styles.heading}>GOLF ROUNDS</Text>
      {rounds.length === 0 ? <Text style={styles.muted}>Rounds you finish will show here.</Text> : rounds.map((round) => {
        const letter = ROUND_LETTER[round.source];
        return (
          <Pressable key={round.id} accessibilityRole="button" accessibilityLabel={`${round.course.name}, ${round.total}`} onPress={() => setOpen(round)} style={[styles.row, styles.roundRow]}>
            <View style={styles.flex}>
              <View style={styles.roundTitle}>
                {letter && <View style={styles.letter} accessibilityLabel={`From ${letter.name}`}><Text style={styles.letterText}>{letter.letter}</Text></View>}
                <Text style={styles.rowTitle} numberOfLines={1}>{round.course.name}</Text>
              </View>
              <Text style={styles.rowSub}>{profileDay(round.datePlayed)}{NAMED_SOURCES.has(round.source) && round.sourceLabel ? ` · ${round.sourceLabel}` : ""}</Text>
            </View>
            <View style={styles.score}>
              <Text style={styles.scoreText}>{round.total}</Text>
              <Text style={styles.scoreSub}>{underScore(round, pairs.get(round.id))}</Text>
            </View>
          </Pressable>
        );
      })}
      {open && <RoundSheet round={open} name={profile.identity.displayName} pair={pairs.get(open.id)} onClose={() => setOpen(null)} />}
    </View>
  );
}

/** One round (website ProfileRoundSheet): the scorecard, then Round (+/−, Thru) and Score + Handicap. */
function RoundSheet({ round, name, pair, onClose }: { round: ProfileHistoryRound; name: string; pair: { differential: number } | "waiting" | undefined; onClose: () => void }) {
  const holes = round.holes;
  const nines = [holes.filter((h) => h.number <= 9), holes.filter((h) => h.number > 9)].filter((n) => n.length);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet} edges={["bottom"]}>
        <View style={styles.sheetTop}>
          <View style={styles.flex}><Text style={styles.sheetTitle}>{name}</Text><Text style={styles.rowSub}>{round.course.name} · {profileDay(round.datePlayed)}</Text></View>
          <SheetClose onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          {nines.length === 0 ? <Text style={styles.muted}>This round was saved as a total only.</Text> : nines.map((nine, i) => (
            <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={styles.card}>
              <View>
                <Line head="Hole" cells={nine.map((h) => String(h.number))} total={i === 0 && nines.length === 2 ? "OUT" : nines.length === 2 ? "IN" : "TOT"} faint />
                <Line head="Par" cells={nine.map((h) => String(h.par))} total={String(nine.reduce((t, h) => t + h.par, 0))} faint />
                <View style={styles.line}>
                  <Text style={styles.lineHead}>Score</Text>
                  {nine.map((h) => <View key={h.number} style={styles.cellBox}><Mark value={h.strokes} par={h.par} /></View>)}
                  <Text style={[styles.cell, styles.cellTotal]}>{nine.reduce((t, h) => t + h.strokes, 0)}</Text>
                </View>
              </View>
            </ScrollView>
          ))}
          <View style={styles.snapshot}>
            <Snap title="Round" items={[["+/−", roundToPar(holes)], ["Thru", holes.length ? String(holes.length) : "—"]]} />
            <Snap title={`${round.holesPlayed} holes`} items={[["Score", String(round.total)], ["Handicap", sheetDifferential(round, pair)]]} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Mark({ value, par }: { value: number; par: number }) {
  const mark = scoreMark(value - par);
  const text = <Text style={styles.markText}>{value}</Text>;
  if (mark === "par") return text;
  const round = mark === "birdie" || mark === "eagle";
  const inner = <View style={[styles.mark, round ? styles.circle : styles.square]}>{text}</View>;
  return mark === "eagle" || mark === "double" ? <View style={[styles.markOuter, round ? styles.circleOuter : styles.squareOuter]}>{inner}</View> : inner;
}

function Line({ head, cells, total, faint = false }: { head: string; cells: string[]; total: string; faint?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineHead, faint && styles.faint]}>{head}</Text>
      {cells.map((c, i) => <Text key={i} style={[styles.cell, faint && styles.faint]}>{c}</Text>)}
      <Text style={[styles.cell, styles.cellTotal, faint && styles.faint]}>{total}</Text>
    </View>
  );
}

function Snap({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <View style={styles.snap}>
      <Text style={styles.snapTitle}>{title}</Text>
      <View style={styles.snapPill}>
        {items.map(([label, value]) => <View key={label} style={styles.snapItem}><Text style={styles.snapLabel}>{label}</Text><Text style={styles.snapValue}>{value}</Text></View>)}
      </View>
    </View>
  );
}

/** Profile → Stats (website ProfileStats, numbers from the shared roundStats). */
export function StatsTab({ profile }: { profile: ProfileModel }) {
  const rounds = profile.rounds.status === "ok" ? profile.rounds.value : [];
  const stats = useMemo(() => { try { return roundStats(rounds); } catch { return null; } }, [rounds]);
  if (!stats) return <View style={styles.darkSection}><Text style={styles.muted}>{profile.isOwner ? "Stats will show here once you finish rounds." : "No stats to show yet."}</Text></View>;
  const holeStats = stats.putting || stats.driving || stats.approach || stats.scrambling;
  return (
    <View style={styles.stats}>
      <View style={styles.darkSection}>
        <StatRow items={[["Handicap", stats.handicapIndex === null ? "—" : stats.handicapIndex.toFixed(1)], ["Scoring Avg.", stats.average18 === null ? "—" : stats.average18.toFixed(1)], ["Low Score", stats.best18 ? String(stats.best18.total) : "—"]]} />
        <View style={styles.divider} />
        <StatRow items={([3, 4, 5] as const).map((par) => { const p = stats.byPar.find((e) => e.par === par); return [`Par ${par}s`, p ? p.average.toFixed(2) : "—"] as [string, string]; })} />
      </View>
      {holeStats && (
        <View style={styles.whiteCard}>
          <Text style={styles.cardHeading}>TEE TO GREEN</Text>
          {stats.driving && <Meter label="Fairways hit" value={stats.driving.fairwayPct} note={`${stats.driving.missLeftPct !== null ? `Misses left ${stats.driving.missLeftPct}% · right ${stats.driving.missRightPct}% · ` : ""}${stats.driving.holes} drives`} />}
          {stats.approach && <Meter label="Greens in regulation" value={stats.approach.girPct} note={`${stats.approach.holes} holes`} />}
          {stats.scrambling && <Meter label="Scrambling" value={stats.scrambling.pct} note={`Par or better after missing the green · ${stats.scrambling.chances} chances`} />}
          {stats.putting && (
            <View style={styles.putting}>
              {[["Putts / round", String(stats.putting.perRound)], ["1-putts", `${stats.putting.onePuttPct}%`], ["3-putts", `${stats.putting.threePuttPct}%`]].map(([l, v]) => (
                <View key={l} style={styles.puttItem}><Text style={styles.puttLabel}>{l}</Text><Text style={styles.puttValue}>{v}</Text></View>
              ))}
            </View>
          )}
        </View>
      )}
      {stats.courses.length > 0 && (
        <View style={styles.whiteCard}>
          <Text style={styles.cardHeading}>MOST PLAYED</Text>
          {stats.courses.map((c) => (
            <View key={c.name} style={styles.courseRow}>
              <Text style={styles.courseName} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.courseSub}>{roundsLabel(c.rounds)}{c.best !== null ? ` · best ${c.best}` : ""}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StatRow({ items }: { items: [string, string][] }) {
  return (
    <View style={styles.statRow}>
      {items.map(([label, value]) => <View key={label} style={styles.statItem}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>)}
    </View>
  );
}

function Meter({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <View style={styles.meter} accessibilityLabel={`${label} ${value}%`}>
      <View style={styles.meterHead}><Text style={styles.meterLabel}>{label}</Text><Text style={styles.meterValue}>{value}%</Text></View>
      <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} /></View>
      <Text style={styles.meterNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  darkSection: { backgroundColor: colors.maroon900, borderRadius: radius.card, paddingHorizontal: gutter, paddingVertical: 18 },
  heading: { fontFamily: fonts.capsSemibold, fontSize: 13, letterSpacing: 1, color: colors.avatarGold },
  headingGap: { marginTop: 28 },
  muted: { marginTop: 8, fontFamily: fonts.regular, fontSize: 15, color: "rgba(251,248,241,0.7)" },
  row: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(251,248,241,0.1)" },
  roundRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream, flexShrink: 1 },
  rowSub: { marginTop: 2, fontFamily: fonts.regular, fontSize: 14, color: "rgba(251,248,241,0.7)" },
  roundTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  letter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: "rgba(201,168,110,0.6)", alignItems: "center", justifyContent: "center" },
  letterText: { fontFamily: fonts.capsBold, fontSize: 11, color: colors.avatarGold },
  score: { alignItems: "flex-end" },
  scoreText: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  scoreSub: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(251,248,241,0.55)" },
  sheet: { flex: 1, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", gap: 10, padding: gutter },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  sheetBody: { paddingHorizontal: gutter, paddingBottom: 40, gap: 12 },
  card: { borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(251,248,241,0.15)" },
  line: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(251,248,241,0.12)" },
  lineHead: { width: 52, paddingVertical: 8, paddingLeft: 8, fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  cell: { width: 30, paddingVertical: 8, textAlign: "center", fontFamily: fonts.regular, fontSize: 12, color: colors.white },
  cellBox: { width: 30, height: 32, alignItems: "center", justifyContent: "center" },
  cellTotal: { width: 40, fontFamily: fonts.bold },
  faint: { opacity: 0.6 },
  markText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  mark: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.white },
  circle: { borderRadius: 11 },
  square: { borderRadius: 2 },
  markOuter: { padding: 1.5, borderWidth: 1, borderColor: colors.white },
  circleOuter: { borderRadius: 14 },
  squareOuter: { borderRadius: 3 },
  snapshot: { flexDirection: "row", gap: 10 },
  snap: { flex: 1, gap: 6 },
  snapTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.avatarGold },
  snapPill: { flexDirection: "row", borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(251,248,241,0.15)" },
  snapItem: { flex: 1, alignItems: "center", paddingVertical: 10 },
  snapLabel: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(251,248,241,0.7)" },
  snapValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  stats: { gap: 12 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(251,248,241,0.15)" },
  statRow: { flexDirection: "row", paddingVertical: 12 },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(251,248,241,0.7)" },
  statValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  whiteCard: { gap: 12, padding: gutter, borderRadius: radius.card, borderWidth: 1, borderColor: "rgba(36,0,1,0.12)", backgroundColor: colors.white },
  cardHeading: { fontFamily: fonts.capsSemibold, fontSize: 12, letterSpacing: 1.4, color: colors.maroon700 },
  meter: { gap: 4 },
  meterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  meterLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  meterValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  meterTrack: { height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: "rgba(36,0,1,0.08)" },
  meterFill: { height: "100%", borderRadius: 5, backgroundColor: colors.maroon700 },
  meterNote: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(36,0,1,0.55)" },
  putting: { flexDirection: "row", paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(36,0,1,0.1)" },
  puttItem: { flex: 1, alignItems: "center" },
  puttLabel: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(36,0,1,0.6)" },
  puttValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  courseRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(36,0,1,0.1)" },
  courseName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  courseSub: { fontFamily: fonts.regular, fontSize: 14, color: "rgba(36,0,1,0.65)" },
});
