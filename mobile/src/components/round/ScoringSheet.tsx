import { useMemo, useRef, useState, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { HolePenalties, ShotResult } from "@/lib/platform/playerRounds";
import type { GameConfig, HoleInput } from "@/lib/platform/roundGames";
import { cardNines, nineTotal } from "@/lib/platform/roundBoard";
import { cardDone, holeStatsDone, nextHoleLabel, nextPar, PUTT_CHOICES, puttLabel, stepStrokes, thruAndToPar, toParText } from "@/lib/platform/roundScoring";
import type { SideGames } from "@/lib/platform/sideGames";
import { HoleGame } from "./HoleGame.tsx";
import { TuckSheet } from "./TuckSheet.tsx";
import type { MyStats } from "~/lib/useRoundScoring.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

type Person = { key: string; name: string; strokes: (number | null)[] };
const tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
const pick = () => { Haptics.selectionAsync().catch(() => {}); };
/** Score card label: first name, upper case (website ScoreCard). */
const label = (name: string) => (name.trim().split(/\s+/)[0] || name).toUpperCase();

/**
 * The scorekeeper's scoring sheet, tucked into the bottom of the round screen (website GolfTripScoring as Play uses it).
 * Scoring view: Thru · Hole + Par · To Par, hole chips, a 2-across grid of score cards (label, − number +), Putts
 * 0–4+, FWY / GIR dials with PEN, the hole's game taps, Next hole. Card view: everyone's nines and Submit & Save.
 */
export function ScoringSheet({ open, onOpenChange, people, meKey, par, range, stats, myStats, onMyStats, onStrokes, onFinish, holeAlert,
  game, gameFits, sideGames, inputs, onPick, onParChange, onSubmit, submitting, locked, referencePar = false, canSubmit = true, cardNotice }: {
  open: boolean; onOpenChange: (open: boolean) => void; people: Person[]; meKey: string; par: number[]; range: [number, number]; stats: boolean;
  myStats: MyStats; onMyStats: (next: MyStats) => void; onStrokes: (key: string, hole: number, strokes: number) => void;
  onFinish: (hole: number) => void; holeAlert: (hole: number) => boolean; game: GameConfig | null; gameFits: boolean; sideGames: SideGames | undefined;
  inputs: HoleInput[]; onPick: (hole: number, next: HoleInput) => void; onParChange?: (hole: number, par: number) => void;
  onSubmit: () => void; submitting: boolean; locked: boolean; referencePar?: boolean; canSubmit?: boolean; cardNotice?: ReactNode;
}) {
  const me = people.find((p) => p.key === meKey);
  const firstOpen = useMemo(() => {
    for (let h = range[0]; h < range[1]; h++) if (me?.strokes[h] == null) return h;
    return range[1] - 1;
  }, [me, range]);
  const [hole, setHole] = useState(firstOpen);
  const [view, setView] = useState<"scoring" | "card">("scoring");
  const holes = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i);
  const { thru, toPar } = thruAndToPar(me?.strokes ?? [], par, range);
  const go = (next: number) => { if (next >= range[0] && next < range[1]) { pick(); setHole(next); } };
  const goRef = useRef(go);
  goRef.current = go;
  const holeRef = useRef(hole);
  holeRef.current = hole;
  // A clear sideways swipe on the score cards: left = next hole, right = previous (website swipeHoles).
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dy) < 40,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 60 && Math.abs(g.dy) < 40) goRef.current(holeRef.current + (g.dx < 0 ? 1 : -1)); },
  })).current;

  const done = cardDone({ range, par, ...myStats, stats }) && (!referencePar || people.every(person => Array.from({ length: range[1] - range[0] }, (_, index) => person.strokes[range[0] + index]).every(stroke => stroke !== null && stroke !== undefined)));
  const setStat = (part: { putts?: number | null; fairway?: ShotResult | null; green?: ShotResult | null; penalty?: keyof HolePenalties }) => {
    const next: MyStats = { putts: [...myStats.putts], fairways: [...myStats.fairways], greens: [...myStats.greens], penalties: [...myStats.penalties] };
    if ("putts" in part) next.putts[hole] = part.putts ?? null;
    if ("fairway" in part) next.fairways[hole] = part.fairway ?? null;
    if ("green" in part) next.greens[hole] = part.green ?? null;
    if (part.penalty) { const now = next.penalties[hole] ?? { fairway: false, green: false }; next.penalties[hole] = { ...now, [part.penalty]: !now[part.penalty] }; }
    onMyStats(next);
  };
  const confirmSubmit = () => Alert.alert("Are you sure?", undefined, [
    { text: "Keep Editing", style: "cancel" },
    { text: "Submit Score", onPress: onSubmit },
  ]);
  const lastHole = hole >= range[1] - 1;
  const holePar = par[hole];
  const pen = myStats.penalties[hole] ?? { fairway: false, green: false };

  return (
    <TuckSheet open={open} onOpenChange={onOpenChange} label="Scoring" tuckedMeta={thru > 0 && toPar !== null ? `${toParText(toPar)}  •  Thru ${thru}` : null}
      topRight={(
        <Pressable accessibilityRole="button" accessibilityLabel={view === "card" ? "Back to scoring" : "Open Card"} onPress={() => { pick(); setView(view === "card" ? "scoring" : "card"); }}
          style={[styles.cardPill, view === "card" && styles.cardPillOn]}>
          <Text style={[styles.cardPillText, view === "card" && styles.cardPillTextOn]}>CARD</Text>
        </Pressable>
      )}>
      {view === "scoring" ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.holeHeader}>
            <Stat label="THRU" value={String(thru)} />
            <View style={styles.holeTitle}>
              <Text style={styles.holeNumber}>Hole {hole + 1}</Text>
              {onParChange && !locked
                ? <Pressable accessibilityRole="button" accessibilityLabel={`Par ${holePar} for hole ${hole + 1}. Tap to change`} onPress={() => { tap(); onParChange(hole, nextPar(holePar)); }} style={styles.parEdit}><Text style={styles.holePar}>Par {holePar} ✎</Text></Pressable>
                : <Text style={styles.holePar}>Par {holePar}</Text>}
            </View>
            <Stat label="TO PAR" value={toPar !== null && thru ? toParText(toPar) : "—"} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {holes.map((h) => {
              const filled = me?.strokes[h] != null;
              return (
                <Pressable key={h} accessibilityRole="button" accessibilityLabel={`Hole ${h + 1}${holeAlert(h) ? ", no Wolf partner picked" : ""}`} accessibilityState={{ selected: h === hole }}
                  onPress={() => go(h)} style={[styles.chip, filled && styles.chipFilled, h === hole && styles.chipActive, holeAlert(h) && styles.chipAlert]}>
                  <Text style={[styles.chipText, filled && styles.chipTextFilled]}>{h + 1}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View {...swipe.panHandlers} style={[styles.scoreSplit, people.length === 1 && styles.scoreSplitOne]}>
            {people.map((person) => (
              <ScoreCard key={person.key} label={person.key === meKey ? "MY SCORE" : label(person.name)} strokes={person.strokes[hole]} par={holePar} disabled={locked} referencePar={referencePar}
                step={(delta) => onStrokes(person.key, hole, stepStrokes(person.strokes[hole], holePar, delta))} />
            ))}
          </View>

          {stats && (
            <>
              <View style={styles.puttsWrap}>
                <Text style={styles.smallCaps}>PUTTS</Text>
                <View style={styles.putts}>
                  {PUTT_CHOICES.map((value) => (
                    <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${puttLabel(value)} putts`} accessibilityState={{ selected: myStats.putts[hole] === value }} disabled={locked}
                      onPress={() => { pick(); setStat({ putts: myStats.putts[hole] === value ? null : value }); }} style={[styles.putt, myStats.putts[hole] === value && styles.puttOn]}>
                      <Text style={[styles.puttText, myStats.putts[hole] === value && styles.puttTextOn]}>{puttLabel(value)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.compassRow}>
                <Compass label="FWY" value={myStats.fairways[hole]} disabled={locked || holePar === 3} onChange={(fairway) => setStat({ fairway })} />
                <View style={styles.penColumn}>
                  <Text style={styles.smallCaps}>PEN</Text>
                  <View style={styles.penButtons}>
                    {(["fairway", "green"] as const).map((key) => (
                      <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${key === "fairway" ? "FWY" : "GRN"} penalty`} accessibilityState={{ selected: pen[key] }}
                        disabled={locked || (key === "fairway" && holePar === 3)} onPress={() => { pick(); setStat({ penalty: key }); }}
                        style={[styles.penButton, pen[key] && styles.dialOn, (locked || (key === "fairway" && holePar === 3)) && styles.off]}>
                        <Text style={[styles.penText, pen[key] && styles.dialTextOn]}>{key === "fairway" ? "FWY" : "GRN"}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Compass label="GIR" value={myStats.greens[hole]} disabled={locked} onChange={(green) => setStat({ green })} />
              </View>
              {!holeStatsDone({ hole, par, ...myStats, stats }) && <Text style={styles.hint}>Putts, GIR{holePar === 3 ? "" : " and FWY"} are needed on every hole to submit.</Text>}
            </>
          )}

          <HoleGame game={game} gameFits={gameFits} sideGames={sideGames} hole={hole} range={range} par={par} names={people.map((p) => p.name)} input={inputs[hole] ?? {}}
            onChange={(next) => onPick(hole, next)} locked={locked} />

          <Pressable accessibilityRole="button" disabled={locked} onPress={() => { tap(); onFinish(hole); if (lastHole) setView("card"); else setHole(hole + 1); }}
            style={({ pressed }) => [styles.next, locked && styles.off, pressed && styles.pressed]}>
            <Text style={styles.nextText}>{nextHoleLabel(hole, range)}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {cardNines(range).map((nine, i) => (
            <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={styles.card}>
              <View>
                <CardRow head={i === 0 && range[0] === 0 ? "Out" : "In"} cells={nine.map((h) => String(h + 1))} total="Tot" faint />
                <CardRow head="Par" cells={nine.map((h) => String(par[h]))} total={String(nine.reduce((t, h) => t + par[h], 0))} faint />
                {people.map((p) => (
                  <CardRow key={p.key} head={p.key === meKey ? "You" : p.name} cells={nine.map((h) => referencePar ? String(p.strokes[h] ?? "") : String(p.strokes[h] ?? par[h]))}
                    total={String(nineTotal(nine, referencePar ? p.strokes : p.strokes.map((s, h) => s ?? par[h])) ?? "")} />
                ))}
              </View>
            </ScrollView>
          ))}
          {cardNotice}
          <Text style={styles.hint}>{referencePar ? "Enter both scores and the required stats on every hole." : done ? "Untouched holes count as par." : "Fill in your stats on every hole to submit."}</Text>
          <Pressable accessibilityRole="button" disabled={!done || !canSubmit || submitting || locked} onPress={confirmSubmit}
            style={({ pressed }) => [styles.next, (!done || !canSubmit || submitting || locked) && styles.off, pressed && styles.pressed]}>
            <Text style={styles.nextText}>{submitting ? "Submitting…" : "Submit & Save"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </TuckSheet>
  );
}

function Stat({ label: text, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{text}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

/** One player's score (website ScoreCard): label on top, − number +, untouched = par. */
function ScoreCard({ label: text, strokes, par, step, disabled, referencePar }: { label: string; strokes: number | null; par: number; step: (delta: number) => void; disabled: boolean; referencePar: boolean }) {
  return (
    <View style={styles.scoreCard}>
      <Text style={styles.scoreLabel} numberOfLines={1}>{text}</Text>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`One less stroke for ${text}`} disabled={disabled} onPress={() => { tap(); step(-1); }} style={[styles.stepButton, disabled && styles.off]}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.strokes} accessibilityLiveRegion="polite">{strokes ?? (referencePar ? "—" : par)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`One more stroke for ${text}`} disabled={disabled} onPress={() => { tap(); step(1); }} style={[styles.stepButton, disabled && styles.off]}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Where the shot finished (website Compass): ✓ in the middle for a hit, arrows for long / left / right / short. */
function Compass({ label: text, value, onChange, disabled }: { label: string; value: ShotResult | null; onChange: (value: ShotResult | null) => void; disabled: boolean }) {
  const button = (direction: ShotResult, mark: string, place: object, name: string, center = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${text} ${name}`} accessibilityState={{ selected: value === direction }} disabled={disabled}
      onPress={() => { pick(); onChange(value === direction ? null : direction); }}
      style={[center ? styles.dialCenter : styles.dialButton, place, value === direction && styles.dialOn, disabled && styles.off]}>
      <Text style={[styles.dialText, value === direction && styles.dialTextOn]}>{mark}</Text>
    </Pressable>
  );
  return (
    <View style={styles.compass}>
      <Text style={styles.smallCaps}>{text}</Text>
      <View style={styles.dial}>
        {button("up", "↑", styles.up, "long")}
        {button("left", "←", styles.left, "left")}
        {button("center", "✓", styles.center, "hit", true)}
        {button("right", "→", styles.right, "right")}
        {button("down", "↓", styles.down, "short")}
      </View>
    </View>
  );
}

function CardRow({ head, cells, total, faint = false }: { head: string; cells: string[]; total: string; faint?: boolean }) {
  return (
    <View style={styles.cardRow}>
      <Text style={[styles.cardHead, faint && styles.faint]} numberOfLines={1}>{head}</Text>
      {cells.map((c, i) => <Text key={i} style={[styles.cell, faint && styles.faint]}>{c}</Text>)}
      <Text style={[styles.cell, styles.cellTotal, faint && styles.faint]}>{total}</Text>
    </View>
  );
}

const DIAL = 140;
const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  cardPill: { width: 72, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.sheetLineSoft, backgroundColor: colors.sheetGlass },
  cardPillOn: { backgroundColor: colors.sheetInk, borderColor: colors.sheetInk },
  cardPillText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.7, color: colors.sheetInk },
  cardPillTextOn: { color: "#c49b54" },
  holeHeader: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  stat: { flex: 1, alignItems: "center" },
  statLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.7, color: colors.sheetMuted },
  statValue: { marginTop: 6, fontFamily: fonts.bold, fontSize: 20, color: colors.sheetInk },
  holeTitle: { alignItems: "center", gap: 2 },
  holeNumber: { fontFamily: fonts.bold, fontSize: 28, color: colors.sheetInk },
  holePar: { fontFamily: fonts.semibold, fontSize: 15, color: colors.sheetMuted },
  parEdit: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: colors.sheetLineSoft },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.sheetLineSoft, backgroundColor: colors.sheetTop },
  chipFilled: { backgroundColor: colors.sheetInk, borderColor: colors.sheetInk },
  chipActive: { borderWidth: 2, borderColor: colors.gold },
  chipAlert: { borderWidth: 2, borderColor: "#ef4444" },
  chipText: { fontFamily: fonts.bold, fontSize: 15, color: colors.sheetInk },
  chipTextFilled: { color: colors.sheetTop },
  scoreSplit: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: 18, columnGap: 10, alignSelf: "center", width: "100%", maxWidth: 340, paddingVertical: 4 },
  scoreSplitOne: { maxWidth: 200 },
  scoreCard: { width: "46%", alignItems: "center", gap: 10 },
  scoreLabel: { maxWidth: "100%", fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.8, color: colors.sheetMuted },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  stepButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.sheetMuted, alignItems: "center", justifyContent: "center" },
  stepText: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 28, color: colors.sheetInk },
  strokes: { minWidth: 44, textAlign: "center", fontFamily: fonts.bold, fontSize: 36, color: colors.sheetInk },
  puttsWrap: { alignItems: "center", gap: 8, marginTop: 4 },
  smallCaps: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1, color: colors.sheetMuted },
  putts: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  putt: { minWidth: 44, height: 40, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.sheetLineSoft, backgroundColor: colors.sheetGlass },
  puttOn: { backgroundColor: colors.sheetInk, borderColor: colors.sheetInk },
  puttText: { fontFamily: fonts.bold, fontSize: 15, color: colors.sheetInk },
  puttTextOn: { color: colors.sheetTop },
  compassRow: { flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: 2 },
  compass: { width: DIAL, alignItems: "center", gap: 6 },
  dial: { width: DIAL, height: DIAL },
  dialButton: { position: "absolute", width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.sheetLine, backgroundColor: "rgba(255,255,255,0.22)" },
  dialCenter: { position: "absolute", width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.sheetLine, backgroundColor: "rgba(255,255,255,0.22)" },
  up: { top: 0, left: DIAL / 2 - 20 },
  down: { bottom: 0, left: DIAL / 2 - 20 },
  left: { left: 0, top: DIAL / 2 - 20 },
  right: { right: 0, top: DIAL / 2 - 20 },
  center: { left: DIAL / 2 - 24, top: DIAL / 2 - 24 },
  dialOn: { backgroundColor: colors.sheetInk, borderColor: colors.sheetInk },
  dialText: { fontFamily: fonts.bold, fontSize: 18, color: colors.sheetInk },
  dialTextOn: { color: colors.sheetTop },
  penColumn: { width: 40, alignItems: "center", gap: 6 },
  penButtons: { gap: 8, marginTop: 30 },
  penButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.sheetLine, backgroundColor: "rgba(255,255,255,0.22)" },
  penText: { fontFamily: fonts.bold, fontSize: 10, color: colors.sheetInk },
  hint: { textAlign: "center", fontFamily: fonts.regular, fontSize: 13, color: colors.sheetMuted },
  next: { alignSelf: "center", width: "74%", height: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.sheetInk },
  nextText: { fontFamily: fonts.bold, fontSize: 14, color: colors.sheetTop },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  card: { borderRadius: radius.control, borderWidth: 1, borderColor: colors.sheetLineSoft, backgroundColor: colors.sheetGlass },
  cardRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.sheetLineSoft },
  cardHead: { width: 64, paddingVertical: 8, paddingLeft: 8, fontFamily: fonts.semibold, fontSize: 13, color: colors.sheetInk },
  cell: { width: 30, paddingVertical: 8, textAlign: "center", fontFamily: fonts.regular, fontSize: 13, color: colors.sheetInk },
  cellTotal: { width: 40, fontFamily: fonts.bold },
  faint: { opacity: 0.6 },
});
