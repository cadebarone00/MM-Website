import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { gameDef, type GameConfig, type HoleInput } from "@/lib/platform/roundGames";
import { toggleChoice, withDaytonaLeft, withDaytonaMiddle, withDouble, withSidePick, withWolfPick, wolfView } from "@/lib/platform/roundScoring";
import { sideGamesOn, type SideGames } from "@/lib/platform/sideGames";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

const tap = () => { Haptics.selectionAsync().catch(() => {}); };

/**
 * A hole's game taps under the score boxes (website HolePicks / Double bet / SidePick): the Wolf's partner (one row,
 * Lone Wolf last), Daytona spots, Bingo Bango Bongo, Snake, Double bet, and greenie / longest drive / closest to the pin.
 * Tap the chosen one again to clear it. Every change goes through the shared rules (lib/platform/roundScoring.ts).
 */
export function HoleGame({ game, gameFits, sideGames, hole, range, par, names, input, onChange, locked }: {
  game: GameConfig | null; gameFits: boolean; sideGames: SideGames | undefined; hole: number; range: [number, number]; par: number[];
  names: string[]; input: HoleInput; onChange: (next: HoleInput) => void; locked: boolean;
}) {
  const kind = game && gameFits ? gameDef(game.id).holeInput : undefined;
  const sides = sideGamesOn(sideGames, hole, par);
  if (!kind && !(game?.doubles && gameFits) && !sides.length) return null;
  return (
    <View style={styles.wrap} pointerEvents={locked ? "none" : "auto"}>
      {kind === "wolf" && <Wolf hole={hole} range={range} names={names} input={input} onChange={onChange} />}
      {kind === "daytona" && (
        <>
          <PickRow label="Middle" names={names} chosen={input.daytona?.middle} onPick={(i) => onChange(withDaytonaMiddle(input, names.length, i))} />
          {input.daytona && (
            <PickRow label="Left pair" names={names} only={names.map((_, i) => i).filter((i) => i !== input.daytona!.middle)}
              isOn={(i) => input.daytona!.left.includes(i)} onPick={(i) => onChange(withDaytonaLeft(input, names.length, i))} />
          )}
        </>
      )}
      {kind === "bbb" && (["bingo", "bango", "bongo"] as const).map((key) => (
        <PickRow key={key} label={key === "bingo" ? "Bingo (first on)" : key === "bango" ? "Bango (closest)" : "Bongo (first in)"} names={names}
          chosen={input.bbb?.[key]} onPick={(i) => onChange({ ...input, bbb: { ...input.bbb, [key]: toggleChoice(input.bbb?.[key], i) } })} />
      ))}
      {kind === "snake" && <PickRow label="Last 3-putt" names={names} chosen={input.snake} onPick={(i) => onChange({ ...input, snake: toggleChoice(input.snake, i) })} />}
      {game?.doubles && gameFits && (
        <Pressable accessibilityRole="button" accessibilityState={{ selected: input.doubled === true }} onPress={() => { tap(); onChange(withDouble(input)); }}
          style={[styles.double, input.doubled && styles.doubleOn]}>
          <Text style={[styles.doubleText, input.doubled && styles.doubleTextOn]}>{input.doubled ? "Doubled ×2 · tap to undo" : "Double bet"}</Text>
        </Pressable>
      )}
      {sides.map((side) => (
        <NameRow key={side} title={side === "greenie" ? "Greenie" : side === "longestDrive" ? "Longest drive" : "Closest to the pin"} names={names}
          chosen={input[side] as number | null | undefined} carryOver={side === "greenie"} onPick={(winner) => onChange(withSidePick(input, side, winner))} />
      ))}
    </View>
  );
}

/** "Cade is the Wolf": the other players as one row of columns, Lone Wolf last (website owner layout 2026-11-22). */
function Wolf({ hole, range, names, input, onChange }: { hole: number; range: [number, number]; names: string[]; input: HoleInput; onChange: (next: HoleInput) => void }) {
  const view = wolfView(hole, range, names, input.wolfPartner);
  return (
    <View style={styles.card} accessibilityLabel="Wolf partner">
      <Text style={styles.cardTitle}>{view.title}</Text>
      <Text style={styles.cardHint}>{view.hint}</Text>
      <View style={styles.columns}>
        {view.partners.map((i) => <Column key={i} label={names[i]} badge={names[i].slice(0, 1).toUpperCase()} on={input.wolfPartner === i} onPress={() => onChange(withWolfPick(input, i))} />)}
        <Column label="Lone Wolf" badge="×2" on={input.wolfPartner === null} onPress={() => onChange(withWolfPick(input, null))} />
      </View>
    </View>
  );
}

/** A side game's winner: the group's names in a row (Greenie adds Carry over). */
function NameRow({ title, names, chosen, carryOver, onPick }: { title: string; names: string[]; chosen: number | null | undefined; carryOver: boolean; onPick: (winner: number | null) => void }) {
  return (
    <View style={styles.card} accessibilityLabel={title}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.columns}>
        {names.map((name, i) => <Column key={i} label={name} badge={name.slice(0, 1).toUpperCase()} on={chosen === i} onPress={() => onPick(i)} />)}
        {carryOver && <Column label="Carry over" badge="→" on={chosen === null} onPress={() => onPick(null)} />}
      </View>
    </View>
  );
}

function Column({ label, badge, on, onPress }: { label: string; badge: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => { tap(); onPress(); }} style={[styles.column, on && styles.columnOn]}>
      <View style={[styles.badge, on && styles.badgeOn]}><Text style={[styles.badgeText, on && styles.badgeTextOn]}>{badge}</Text></View>
      <Text style={[styles.columnLabel, on && styles.columnLabelOn]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

/** A labelled row of name buttons (Daytona, Bingo Bango Bongo, Snake). */
function PickRow({ label, names, chosen, only, isOn, onPick }: { label: string; names: string[]; chosen?: number; only?: number[]; isOn?: (i: number) => boolean; onPick: (i: number) => void }) {
  const list = only ?? names.map((_, i) => i);
  return (
    <View style={styles.pickRow} accessibilityLabel={label}>
      <Text style={styles.pickLabel}>{label}</Text>
      <View style={styles.pickButtons}>
        {list.map((i) => {
          const on = isOn ? isOn(i) : chosen === i;
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { tap(); onPick(i); }} style={[styles.pick, on && styles.pickOn]}>
              <Text style={[styles.pickText, on && styles.pickTextOn]}>{names[i]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Cream scoring sheet colors (website GolfTripScoring: maroon ink on cream, maroon fill when chosen).
const styles = StyleSheet.create({
  wrap: { gap: 10 },
  card: { gap: 6, padding: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.sheetLineSoft, backgroundColor: colors.sheetGlass },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.sheetInk },
  cardHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.sheetMuted },
  columns: { flexDirection: "row", marginTop: 4 },
  column: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.sheetLine },
  columnOn: { backgroundColor: "rgba(36,0,1,0.06)" },
  badge: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.sheetLine, alignItems: "center", justifyContent: "center" },
  badgeOn: { backgroundColor: colors.sheetInk, borderColor: colors.sheetInk },
  badgeText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.sheetInk },
  badgeTextOn: { color: colors.sheetTop },
  columnLabel: { fontFamily: fonts.regular, fontSize: 12, textAlign: "center", color: colors.sheetMuted },
  columnLabelOn: { fontFamily: fonts.semibold, color: colors.sheetInk },
  double: { minHeight: minTap + 2, alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1.5, borderColor: colors.sheetInk },
  doubleOn: { backgroundColor: colors.sheetInk },
  doubleText: { fontFamily: fonts.bold, fontSize: 15, color: colors.sheetInk },
  doubleTextOn: { color: colors.sheetTop },
  pickRow: { gap: 6 },
  pickLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8, color: colors.sheetMuted },
  pickButtons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pick: { minHeight: 40, paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.sheetLineSoft, backgroundColor: colors.sheetGlass },
  pickOn: { backgroundColor: colors.sheetInk, borderColor: colors.sheetInk },
  pickText: { fontFamily: fonts.bold, fontSize: 14, color: colors.sheetInk },
  pickTextOn: { color: colors.sheetTop },
});
