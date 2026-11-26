import { useMemo } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { holesDone } from "@/lib/platform/golfTab";
import { normalizeCompetitor, type GolfMatchPairing, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { matchCard, winCurve } from "@/lib/platform/matchCenter";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

/**
 * One match, opened from the Golf tab's match list (website MatchDetail, project_specs.md Golf Trips part 2d slice 1b):
 * the status, the hole-by-hole match scorecard, the chance to win after each hole (same model as Predict) and stats.
 */
export function TripMatchDetail({ match, pairing, number, round, net, teamNames, showStats, onClose }: {
  match: GolfMatchPreview; pairing: GolfMatchPairing; number: number; round: number; net: boolean; teamNames: [string, string]; showStats: boolean; onClose: () => void;
}) {
  const scored = (pairing.round ?? match.round) === match.round;
  const card = useMemo(() => matchCard(scored ? match : { ...match, leaderboard: [] }, pairing, net), [match, pairing, net, scored]);
  const curve = useMemo(() => winCurve(match, card), [match, card]);
  const lead = card.played ? card.holes[card.played - 1].lead ?? 0 : 0;
  const leader = lead > 0 ? teamNames[0] : teamNames[1];
  const names = (side: "left" | "right") => (side === "left" ? normalizeCompetitor(pairing.left) : pairing.right ? normalizeCompetitor(pairing.right) : null)?.golfers.map((g) => g.name) ?? [];
  const dataStanding = net ? pairing.net : pairing.gross;
  const status = !scored ? (pairing.result ? (dataStanding?.leader ? `${dataStanding.leader === "left" ? teamNames[0] : teamNames[1]} won ${pairing.result}` : "Halved") : "Not started")
    : card.played === 0 ? "Not started" : card.finished ? (lead === 0 ? "Halved" : `${leader} won ${card.result}`)
    : `${lead === 0 ? "All square" : `${leader} ${Math.abs(lead)} UP`} thru ${card.played}`;
  const statsFor = (i: 0 | 1) => {
    const side = pairing.sides?.[i];
    const comp = i === 0 ? normalizeCompetitor(pairing.left) : pairing.right ? normalizeCompetitor(pairing.right) : null;
    const holes = holesDone(comp?.thru ?? comp?.golfers[0]?.thru);
    const putts = Number(side?.putts);
    return [["Fairways", side?.fairwayPct || "—"], ["Greens", side?.greenPct || "—"], ["Putts / hole", holes && Number.isFinite(putts) && putts > 0 ? (putts / holes).toFixed(1) : "—"]] as const;
  };
  const now = curve.at(-1);
  const rows = [...card.left.map((p) => ({ p, side: "left" as const })), ...card.right.map((p) => ({ p, side: "right" as const }))];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.top}><Text style={styles.topText}>Match {number} · Round {round}{net ? " · Net" : ""}</Text><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 18 }}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}><Text style={styles.team}>{teamNames[0]}</Text>{names("left").map((n) => <Text key={n} style={styles.player}>{n}</Text>)}</View>
            <Text style={styles.status} accessibilityRole="summary">{status}</Text>
            <View style={{ flex: 1, alignItems: "flex-end" }}><Text style={styles.team}>{teamNames[1]}</Text>{names("right").map((n) => <Text key={n} style={[styles.player, { textAlign: "right" }]}>{n}</Text>)}</View>
          </View>

          <View accessibilityLabel="Match scorecard">
            <Text style={styles.title}>Scorecard</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, (card.played - 4) * 34), y: 0 }}>
              <View>
                <Row label="Hole" cells={card.holes.map((h) => String(h.hole))} muted />
                <Row label="Par" cells={card.holes.map((h) => String(h.par))} muted />
                {rows.filter((r) => r.side === "left").map(({ p }) => <Row key={p.name} label={p.name.split(/\s+/)[0]} cells={card.holes.map((h) => p.holes[h.hole - 1] == null ? "" : `${p.holes[h.hole - 1]}${net && p.strokes[h.hole - 1] > 0 ? "•" : ""}`)} />)}
                <Row label="Match" cells={card.holes.map((h) => h.lead === null ? "" : h.lead === 0 ? "AS" : String(Math.abs(h.lead)))} leads={card.holes.map((h) => h.lead)} />
                {rows.filter((r) => r.side === "right").map(({ p }) => <Row key={p.name} label={p.name.split(/\s+/)[0]} cells={card.holes.map((h) => p.holes[h.hole - 1] == null ? "" : `${p.holes[h.hole - 1]}${net && p.strokes[h.hole - 1] > 0 ? "•" : ""}`)} />)}
              </View>
            </ScrollView>
            {!scored ? <Text style={styles.note}>Hole-by-hole scores for this round aren't available yet.</Text>
              : card.played === 0 && <Text style={styles.note}>Scores show here hole by hole once the match starts.</Text>}
          </View>

          <View accessibilityLabel="Chance to win">
            <Text style={styles.title}>Chance to win</Text>
            {scored && curve.length > 0 && now ? <>
              {/* After each hole: how likely the left side is to win (bars rise toward whoever's favored). */}
              <View style={styles.chart} accessibilityLabel={`${teamNames[0]} ${Math.round(now.left * 100)} percent`}>
                <View style={styles.mid} />
                {curve.map((point, i) => {
                  const lean = point.left - point.right;
                  return <View key={i} style={styles.barSlot}><View style={[styles.bar, lean >= 0 ? { bottom: "50%", height: `${lean * 50}%`, backgroundColor: colors.goldBright } : { top: "50%", height: `${-lean * 50}%`, backgroundColor: colors.errorOnMaroon }]} /></View>;
                })}
              </View>
              <View style={styles.chances}>
                <Chance label={teamNames[0]} value={now.left} /><Chance label="Halved" value={now.halved} /><Chance label={teamNames[1]} value={now.right} />
              </View>
              <Text style={styles.note}>From each player's history and handicap, with the holes played so far locked in (same model as Predict).</Text>
            </> : <Text style={styles.note}>Odds show for the round being played.</Text>}
          </View>

          {showStats && <View accessibilityLabel="Team stats">
            <Text style={styles.title}>Stats</Text>
            {statsFor(0).map(([label, value], i) => <View key={label} style={styles.statRow}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{statsFor(1)[i][1]}</Text></View>)}
          </View>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Row({ label, cells, muted = false, leads }: { label: string; cells: string[]; muted?: boolean; leads?: (number | null)[] }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && { color: colors.boardGold }]} numberOfLines={1}>{label}</Text>
      {cells.map((c, i) => {
        const lead = leads?.[i];
        return <Text key={i} style={[styles.cell, muted && { color: colors.boardInk }, lead != null && lead !== 0 && { color: lead > 0 ? colors.goldBright : colors.errorOnMaroon, fontFamily: fonts.bold }]}>{c}</Text>;
      })}
    </View>
  );
}

function Chance({ label, value }: { label: string; value: number }) {
  return <View style={{ flex: 1, alignItems: "center" }}><Text style={styles.statLabel} numberOfLines={1}>{label}</Text><Text style={styles.chance}>{Math.round(value * 100)}%</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  topText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.boardInk },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  team: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  player: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  status: { width: 110, textAlign: "center", fontFamily: fonts.bold, fontSize: 14, color: colors.goldBright },
  title: { marginBottom: 8, fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  row: { flexDirection: "row", alignItems: "center", height: 30, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  rowLabel: { width: 64, fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  cell: { width: 34, textAlign: "center", fontFamily: fonts.regular, fontSize: 13, color: colors.cream, fontVariant: ["tabular-nums"] },
  note: { marginTop: 8, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  chart: { height: 120, flexDirection: "row", borderRadius: radius.control, borderWidth: 1, borderColor: colors.avatarRing, overflow: "hidden", backgroundColor: colors.boardBottom },
  mid: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: colors.boardBorderSoft },
  barSlot: { flex: 1, marginHorizontal: 1 },
  bar: { position: "absolute", left: 0, right: 0 },
  chances: { flexDirection: "row", marginTop: 10 },
  chance: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  statRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  statValue: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  statLabel: { width: 110, textAlign: "center", fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
});
