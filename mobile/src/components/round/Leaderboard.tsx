import { Fragment, useState } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { GameResult } from "@/lib/platform/roundGames";
import { cardNines, cashCell, leaderboardLines, nineTotal, scoreMark } from "@/lib/platform/roundBoard";
import { money } from "@/lib/platform/roundSetupForm";
import { Avatar } from "~/components/Avatar.tsx";
import { colors, fonts } from "~/lib/theme.ts";

/**
 * The round's leaderboard (website PlayRound Leaderboard, trip look): "Hole 8 · thru 7 · Skins", then POS · PLAYER · TOT,
 * SKINS for Skins, $ when there's money. Tap a name for that player's scorecard (nines, Par, Score marks, $ per hole).
 * Positions, totals and money come from the shared lib/platform/roundBoard.ts.
 */
export function Leaderboard({ rows, par, range, result, holeMoney, extraMoney, doubled }: {
  rows: { name: string; strokes: (number | null)[] }[]; par: number[]; range: [number, number]; result: GameResult | null;
  holeMoney: (number | null)[][] | null; extraMoney: number[] | null; doubled: boolean[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const board = leaderboardLines({ rows, par, range, result, holeMoney, extraMoney });
  return (
    <View style={styles.board} accessibilityLabel="Leaderboard">
      <Text style={styles.head}>{board.head}</Text>
      <View style={styles.headings}>
        <Text style={[styles.colLabel, styles.pos]}>POS</Text>
        <Text style={[styles.colLabel, styles.player]}>PLAYER</Text>
        <Text style={[styles.colLabel, styles.num]}>TOT</Text>
        {board.skins && <Text style={[styles.colLabel, styles.num]}>SKINS</Text>}
        {board.hasMoney && <Text style={[styles.colLabel, styles.cash]}>$</Text>}
      </View>
      {board.lines.map((line) => (
        <Fragment key={line.name}>
          <View style={styles.row}>
            <View style={styles.rank}><Text style={styles.rankText}>{line.position}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`${line.name} scorecard`} accessibilityState={{ expanded: open === line.name }}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(open === line.name ? null : line.name); }} style={styles.player}>
              <View style={styles.who}>
                <Avatar name={line.name} size={28} />
                <Text style={styles.name} numberOfLines={1}>{line.name}</Text>
              </View>
            </Pressable>
            <Text style={[styles.number, styles.num, line.tone === "under" && styles.under, line.tone === "even" && styles.even]}>{line.total}</Text>
            {board.skins && <Text style={[styles.number, styles.num]}>{line.gameValue}</Text>}
            {board.hasMoney && <Text style={[styles.number, styles.cash, line.cash > 0 && styles.up, line.cash < 0 && styles.down]}>{line.cash ? money(line.cash) : "$0"}</Text>}
          </View>
          {open === line.name && <PlayerCard strokes={line.strokes} par={par} range={range} pnl={line.pnl} doubled={doubled} />}
        </Fragment>
      ))}
      {board.note ? <Text style={styles.note}>{board.note}</Text> : null}
      {result && !board.perPlayer && (
        <View style={styles.standings}>
          <Text style={styles.standingsTitle}>{result.title}</Text>
          {result.standings.map((s, i) => (
            <View key={i} style={styles.standingRow}>
              <Text style={styles.standingLabel}>{s.label}</Text>
              <Text style={styles.standingValue}>{s.value}{s.money !== undefined ? `${s.value ? " · " : ""}${s.money === 0 ? "$0" : money(s.money)}` : ""}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** One player's scorecard (website PlayerCard): front / back nine, Par, Score with marks, and a $ row when there's money. */
function PlayerCard({ strokes, par, range, pnl, doubled }: { strokes: (number | null)[]; par: number[]; range: [number, number]; pnl: (number | null)[] | null; doubled: boolean[] }) {
  return (
    <View style={styles.card}>
      {cardNines(range).map((holes, i) => (
        <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.cardRow}>
              <Text style={[styles.cardHead, styles.faint]}>{i === 0 && range[0] === 0 ? "Out" : "In"}</Text>
              {holes.map((h) => <Text key={h} style={[styles.cell, styles.faint]}>{h + 1}{doubled[h] ? "²" : ""}</Text>)}
              <Text style={[styles.cell, styles.total, styles.faint]}>Tot</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={[styles.cardHead, styles.faint]}>Par</Text>
              {holes.map((h) => <Text key={h} style={[styles.cell, styles.faint]}>{par[h]}</Text>)}
              <Text style={[styles.cell, styles.total, styles.faint]}>{holes.reduce((t, h) => t + par[h], 0)}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardHead}>Score</Text>
              {holes.map((h) => <View key={h} style={styles.cellBox}>{strokes[h] != null ? <ScoreMark value={strokes[h]!} par={par[h]} /> : null}</View>)}
              <Text style={[styles.cell, styles.total]}>{nineTotal(holes, strokes) ?? ""}</Text>
            </View>
            {pnl && (
              <View style={styles.cardRow}>
                <Text style={styles.cardHead}>$</Text>
                {holes.map((h) => <Text key={h} style={[styles.cell, styles.bold, (pnl[h] ?? 0) > 0 && styles.up, (pnl[h] ?? 0) < 0 && styles.down]}>{cashCell(pnl[h])}</Text>)}
                <Text style={[styles.cell, styles.total, styles.bold]}>{cashCell(nineTotal(holes, pnl))}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      ))}
    </View>
  );
}

/** circle = birdie, double circle = eagle or better, square = bogey, double square = double bogey or worse, par plain. */
function ScoreMark({ value, par }: { value: number; par: number }) {
  const mark = scoreMark(value - par);
  const round = mark === "birdie" || mark === "eagle";
  const double = mark === "eagle" || mark === "double";
  const text = <Text style={styles.markText}>{value}</Text>;
  if (mark === "par") return text;
  const inner = <View style={[styles.mark, round ? styles.circle : styles.square]}>{text}</View>;
  return double ? <View style={[styles.markOuter, round ? styles.circleOuter : styles.squareOuter]}>{inner}</View> : inner;
}

const styles = StyleSheet.create({
  board: { gap: 6 },
  head: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk },
  headings: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6 },
  colLabel: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.3)", fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 1, color: colors.boardInk, textAlign: "center" },
  pos: { width: 30 },
  player: { flex: 1, minWidth: 0, textAlign: "left" },
  num: { width: 40, textAlign: "center" },
  cash: { width: 56, textAlign: "right" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  rank: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  rankText: { fontFamily: fonts.bold, fontSize: 13, color: colors.maroon900 },
  who: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  number: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  under: { color: "#ef4444" },
  even: { color: colors.avatarGold },
  up: { color: "#b9e0b0" },
  down: { color: "#e0a3a3" },
  bold: { fontFamily: fonts.bold },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  standings: { gap: 4, marginTop: 6 },
  standingsTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.avatarGold },
  standingRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  standingLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.cream },
  standingValue: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  card: { gap: 8, paddingVertical: 6 },
  cardRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.12)" },
  cardHead: { width: 44, paddingVertical: 6, paddingLeft: 4, fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  faint: { opacity: 0.6 },
  cell: { width: 30, paddingVertical: 6, textAlign: "center", fontFamily: fonts.regular, fontSize: 12, color: colors.white },
  cellBox: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  total: { width: 38, fontFamily: fonts.semibold },
  markText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  mark: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.white },
  circle: { borderRadius: 11 },
  square: { borderRadius: 2 },
  markOuter: { padding: 1.5, borderWidth: 1, borderColor: colors.white },
  circleOuter: { borderRadius: 14 },
  squareOuter: { borderRadius: 3 },
});
