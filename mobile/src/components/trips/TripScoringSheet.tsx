import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { cardDone } from "@/lib/platform/roundScoring";
import { holeEditable, openCorrectionHoles, type TripCorrections } from "@/lib/platform/tripCorrections";
import { tripCardCheck, type HoleEntryInput, type TripRoundScoring } from "@/lib/platform/tripScoring";
import { ScoringSheet } from "~/components/round/ScoringSheet.tsx";
import type { MyStats } from "~/lib/useRoundScoring.ts";
import { useTripCorrections } from "~/lib/useTripCorrections.ts";
import { useTripScoring } from "~/lib/useTripScoring.ts";
import { TripCorrectionsPanel } from "./TripCorrections.tsx";
import { colors, fonts } from "~/lib/theme.ts";

const holeList = (holes: number[]) => holes.length === 1 ? `hole ${holes[0]}` : `holes ${holes.slice(0, -1).join(", ")} and ${holes.at(-1)}`;

/**
 * Player & Attest scoring in the app (project_specs.md Golf Trips part 2d slice 3): the same native tuck-in sheet as Play,
 * two across (my score and the player I attest). Par is reference only: an untouched hole stays unentered. Shown only to
 * a member seated in today's round with an attestee and once the organizer has confirmed the course's 18 pars.
 *   - Every change is saved on this phone first (per account, trip and round) and sent when there's a connection; a phone
 *     signed in to another account never sends them (useTripScoring / tripScoringTransport).
 *   - The status line: Saved locally · Pending sync / Synced / Verified / Conflict / Submitted. My score is checked against
 *     what my attester entered for me, hole by hole; the column I keep is checked against my attestee's own card.
 *   - Submit & Save only once the card is complete, synced and my attester agrees on all 18; the server checks again.
 *   - Corrections (slice 4): after submitting I can ask to correct holes; once the organizer approves, only those holes
 *     of my card reopen, my attester enters them again (made for that request) and I resubmit. Locked holes never change.
 */
export function TripScoringSheet({ tripId, profileId, initial, initialCorrections }: { tripId: string; profileId: string; initial: TripRoundScoring; initialCorrections?: TripCorrections | null }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const score = useTripScoring(tripId, profileId, initial);
  const corr = useTripCorrections(tripId, profileId, initial.roundNumber, initialCorrections);
  const view = score.view;
  const pars = score.scoring.pars?.pars ?? [];
  if (!view || pars.length !== 18 || !view.seat.attesteeId) return null;
  const { card, seat } = view;
  const attesteeId = view.seat.attesteeId;
  const attesterName = score.scoring.groups.flatMap((g) => g.players).find((p) => p.profileId === seat.attesterId)?.displayName ?? "your attester";
  const myStats: MyStats = { putts: card.putts, fairways: card.fairways, greens: card.greens, penalties: card.penalties };
  const ops = score.ops ?? [];
  const open = openCorrectionHoles(corr.corrections, profileId, attesteeId);
  const attesteeSubmitted = score.scoring.groups.flatMap((g) => g.players).some((p) => p.profileId === attesteeId && p.submittedAt !== null);
  const reopened = (open.own?.length ?? 0) > 0 || (open.attest?.length ?? 0) > 0;
  const conflicts = ops.filter((op) => op.status === "conflict");
  const rejected = ops.filter((op) => op.status === "rejected");
  const check = tripCardCheck(seat, card, { connected: score.connected && !score.problem, pending: ops.some((op) => op.status === "pending"), conflict: conflicts.length > 0,
    complete: cardDone({ range: [0, 18], par: pars, ...myStats, stats: true }) });

  const ownEntry = (hole: number, stats: MyStats = myStats): HoleEntryInput => ({ hole: hole + 1, strokes: card.holes[hole], putts: stats.putts[hole], fairway: pars[hole] === 3 ? null : stats.fairways[hole], green: stats.greens[hole], penaltyFairway: stats.penalties[hole]?.fairway ?? false, penaltyGreen: stats.penalties[hole]?.green ?? false });
  const send = async (kind: "own" | "attest", entry: HoleEntryInput) => {
    // Only holes that may change: everything before submitting; after that, only a correction's approved holes.
    const editable = kind === "own" ? holeEditable(open.own, seat.submitted, entry.hole) : holeEditable(open.attest, attesteeSubmitted, entry.hole);
    if (!editable) { Alert.alert("Hole locked", kind === "own" ? "Your card is submitted. Request a correction to change a hole." : "That card is submitted, so this hole can't change."); return; }
    // Re-attesting a reopened golfer: only an entry made now, for their approved correction, carries its id.
    const madeFor = kind === "attest" && open.attestRequestId && open.attest?.includes(entry.hole) ? open.attestRequestId : undefined;
    setBusy(true);
    setMessage(null);
    try { await score.edit(kind, entry, madeFor); } catch { Alert.alert("Couldn't save", "Try again when your phone can save scores."); }
    finally { setBusy(false); }
  };
  const statsChanged = (next: MyStats) => {
    const index = next.putts.findIndex((_, i) => next.putts[i] !== myStats.putts[i] || next.fairways[i] !== myStats.fairways[i] || next.greens[i] !== myStats.greens[i] || JSON.stringify(next.penalties[i]) !== JSON.stringify(myStats.penalties[i]));
    if (index >= 0) void send("own", ownEntry(index, next));
  };
  const submit = async () => {
    setSubmitting(true);
    const result = await score.submit(open.own ?? []);
    await corr.refresh();
    setSubmitting(false);
    setMessage(result.message);
    if (!result.ok) Alert.alert("Not submitted", result.message);
  };

  const cardNotice = <View style={styles.notice}>
    <Text style={[styles.status, check.status === "Verified" || check.status === "Submitted" ? styles.good : check.status === "Conflict" ? styles.bad : null]} accessibilityLiveRegion="polite">
      {score.problem || check.status}
    </Text>
    {!seat.submitted && check.verified && check.mine.mismatch.length > 0 && <Text style={[styles.text, styles.bad]}>Your score on {holeList(check.mine.mismatch)} doesn't match {attesterName}'s card. Check with them and fix whichever is wrong.</Text>}
    {!seat.submitted && check.mine.waiting.length > 0 && <Text style={styles.text}>Waiting for {attesterName} to enter {holeList(check.mine.waiting)}.</Text>}
    {!seat.submitted && check.verified && check.theirs.mismatch.length > 0 && <Text style={styles.text}>{seat.attesteeName ?? "Their"}'s own card has a different score on {holeList(check.theirs.mismatch)} than you entered.</Text>}
    {rejected.length > 0 && <Text style={[styles.text, styles.bad]}>A score was refused because the card is locked. It wasn't saved.</Text>}
    {conflicts.map((op) => <View key={op.key} style={styles.conflict}>
      <Text style={styles.text}>Hole {op.entry.hole} · {op.kind === "own" ? "Your score" : seat.attesteeName} was changed on another phone.</Text>
      <Text style={styles.text}>Mine: {op.entry.strokes ?? "—"} · Saved: {op.server?.entry.strokes ?? "—"}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => void score.resolve(op.key, "mine")}><Text style={styles.action}>Keep mine</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void score.resolve(op.key, "saved")}><Text style={styles.action}>Use saved</Text></Pressable>
      </View>
    </View>)}
    {open.own && open.own.length > 0 && <Text style={styles.text}>Correction approved: you can change {holeList(open.own)}; the rest of your card stays locked.</Text>}
    {open.attest && open.attest.length > 0 && <Text style={styles.text}>{seat.attesteeName ?? "Your player"}'s correction was approved: enter {holeList(open.attest)} again for them.</Text>}
    {message && <Text style={styles.text}>{message}</Text>}
    {corr.corrections && <TripCorrectionsPanel corrections={corr.corrections} profileId={profileId} groupId={seat.groupId} submitted={seat.submitted}
      act={async (body) => { const result = await corr.act(body); await score.refresh(); return result; }} />}
  </View>;

  return <ScoringSheet open={sheetOpen} onOpenChange={setSheetOpen} referencePar canSubmit={check.ready}
    people={[{ key: profileId, name: seat.myName, strokes: card.holes }, { key: attesteeId, name: seat.attesteeName || "Player", strokes: card.opponentHoles }]}
    meKey={profileId} par={pars} range={[0, 18]} stats myStats={myStats} onMyStats={statsChanged}
    onStrokes={(key, hole, strokes) => { if (key === profileId) void send("own", { ...ownEntry(hole), strokes }); else void send("attest", { hole: hole + 1, strokes }); }}
    onFinish={() => {}} holeAlert={() => false} game={null} gameFits={false} sideGames={undefined} inputs={[]} onPick={() => {}}
    onSubmit={() => void submit()} submitting={submitting} cardNotice={cardNotice}
    locked={(seat.submitted && !reopened) || busy || submitting || Boolean(score.problem) || conflicts.length > 0 || rejected.length > 0} />;
}

/** Why the scoring sheet isn't showing for today's round (or null when it is / there's no round today). */
export function tripScoringNote(scoring: TripRoundScoring | null, profileId: string): string | null {
  if (!scoring) return null;
  const me = scoring.groups.flatMap((g) => g.players).find((p) => p.profileId === profileId);
  if (!me) return null;
  if ((scoring.pars?.pars?.length ?? 0) !== 18) return "Scoring opens once the organizer confirms this course's pars in Trip Settings.";
  if (!scoring.groups.flatMap((g) => g.players).some((p) => p.attesterProfileId === profileId)) return "You're not keeping anyone's score in today's group yet. The organizer sets attesters in Trip Settings.";
  return null;
}

const styles = StyleSheet.create({
  notice: { gap: 10 },
  conflict: { gap: 4 },
  status: { fontFamily: fonts.bold, fontSize: 16, color: colors.sheetInk },
  good: { color: colors.money.up },
  bad: { color: colors.error },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.sheetInk },
  actions: { flexDirection: "row", gap: 20 },
  action: { color: colors.maroon700, fontFamily: fonts.semibold, paddingVertical: 10 },
});
