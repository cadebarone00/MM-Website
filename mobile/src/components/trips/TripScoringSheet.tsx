import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { TripRoundScoring, HoleEntryInput } from "@/lib/platform/tripScoring";
import { ScoringSheet } from "~/components/round/ScoringSheet.tsx";
import type { MyStats } from "~/lib/useRoundScoring.ts";
import { useTripScoring } from "~/lib/useTripScoring.ts";
import { colors, fonts } from "~/lib/theme.ts";

/** Trip score entry uses the same native sheet as Play, with par displayed only as reference. */
export function TripScoringSheet({ tripId, profileId, initial }: { tripId: string; profileId: string; initial: TripRoundScoring }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const score = useTripScoring(tripId, profileId, initial);
  const view = score.view;
  const pars = score.scoring.pars?.pars ?? [];
  if (!view || pars.length !== 18 || !view.seat.attesteeId) return null;
  const { card, seat } = view;
  const attesteeId = view.seat.attesteeId;
  const myStats: MyStats = { putts: card.putts, fairways: card.fairways, greens: card.greens, penalties: card.penalties };
  const ownEntry = (hole: number, stats: MyStats = myStats): HoleEntryInput => ({ hole: hole + 1, strokes: card.holes[hole], putts: stats.putts[hole], fairway: stats.fairways[hole], green: stats.greens[hole], penaltyFairway: stats.penalties[hole]?.fairway ?? false, penaltyGreen: stats.penalties[hole]?.green ?? false });
  const send = async (kind: "own" | "attest", entry: HoleEntryInput) => {
    setBusy(true);
    try { await score.edit(kind, entry); } catch { Alert.alert("Couldn't save", "Try again when your phone can save scores."); }
    finally { setBusy(false); }
  };
  const statsChanged = (next: MyStats) => {
    const index = next.putts.findIndex((_, i) => next.putts[i] !== myStats.putts[i] || next.fairways[i] !== myStats.fairways[i] || next.greens[i] !== myStats.greens[i] || JSON.stringify(next.penalties[i]) !== JSON.stringify(myStats.penalties[i]));
    if (index >= 0) void send("own", ownEntry(index, next));
  };
  const status = score.problem || (!score.connected ? "Waiting for connection" : score.ops?.some(op => op.status === "conflict") ? "Resolve score conflicts" : score.ops?.some(op => op.status === "rejected") ? "A score was refused because the card is locked" : score.ops?.length ? "Scores waiting to sync" : "Scores synced");
  const cardNotice = <View style={styles.notice}><Text style={styles.text} accessibilityLiveRegion="polite">{status}</Text>{score.ops?.filter(op => op.status === "conflict").map(op => <View key={op.key} style={styles.conflict}><Text style={styles.text}>Hole {op.entry.hole} · {op.kind === "own" ? "Your score" : seat.attesteeName}</Text><Text style={styles.text}>Mine: {op.entry.strokes ?? "—"} · Saved: {op.server?.entry.strokes ?? "—"}</Text><View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => void score.resolve(op.key, "mine")}><Text style={styles.action}>Keep mine</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void score.resolve(op.key, "saved")}><Text style={styles.action}>Use saved</Text></Pressable></View></View>)}</View>;
  return <ScoringSheet open={open} onOpenChange={setOpen} referencePar canSubmit={false} people={[{ key: profileId, name: seat.myName, strokes: card.holes }, { key: attesteeId, name: seat.attesteeName || "Player", strokes: card.opponentHoles }]} meKey={profileId} par={pars} range={[0, 18]} stats myStats={myStats} onMyStats={statsChanged}
    onStrokes={(key, hole, strokes) => { if (key === profileId) void send("own", { ...ownEntry(hole), strokes }); else void send("attest", { hole: hole + 1, strokes }); }}
    onFinish={() => {}} holeAlert={() => false} game={null} gameFits={false} sideGames={undefined} inputs={[]} onPick={() => {}} onSubmit={() => {}} submitting={false} cardNotice={cardNotice} locked={seat.submitted || busy || Boolean(score.problem) || Boolean(score.ops?.some(op => op.status !== "pending"))} />;
}
const styles = StyleSheet.create({ notice: { gap: 10 }, conflict: { gap: 4 }, text: { fontFamily: fonts.regular, fontSize: 15, color: colors.sheetInk }, actions: { flexDirection: "row", gap: 20 }, action: { color: colors.maroon700, fontFamily: fonts.semibold, paddingVertical: 10 } });
