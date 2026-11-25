import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { attestAgrees, attestCard, attestPairs, cardFor, currentRound, cutFrom, submitted, type CodeTournament } from "@/lib/platform/codeTournaments";
import { apiJson } from "~/lib/api.ts";
import { useAuth } from "~/lib/auth.tsx";
import { saveTournamentScore } from "~/lib/tournamentScoreSave.ts";
import { tournamentEntryScope, tournamentHoleStatus } from "~/lib/tournamentCard.ts";
import { colors, fonts } from "~/lib/theme.ts";

/** Server-acknowledged, one-hole-at-a-time entry. Nothing is shown as saved before the server accepts it. */
export function TournamentScoring({ tournament, reload }: { tournament: CodeTournament; reload: () => Promise<boolean> }) {
  const { session } = useAuth(); const me = session?.user.id ?? null;
  const [hole, setHole] = useState(1); const [value, setValue] = useState("");
  const [draftScope, setDraftScope] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [mode, setMode] = useState<"own" | "attest">("own"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  if (!me || tournament.status !== "live" || !tournament.players.some(p => p.profileId === me) || !tournament.rounds.length) return null;
  const round = currentRound(tournament, me, new Date().toLocaleDateString("en-CA"));
  const setup = tournament.rounds.find(r => r.number === round); if (!setup) return null;
  if (cutFrom(tournament, me, round)) return <Text style={styles.text}>You missed the cut. Follow the rest of the tournament on the leaderboard.</Text>;
  const pairs = attestPairs(tournament, round);
  const target = pairs.attesteeOf(me);
  const attester = pairs.attesterOf(me);
  const targetName = tournament.players.find(p => p.profileId === target)?.name;
  const locked = submitted(tournament, me, round);
  const own = cardFor(tournament, me, round); const attested = target ? attestCard(tournament, me, target, round) : [];
  const attesterCard = attester ? attestCard(tournament, attester, me, round) : [];
  const targetOwn = target ? cardFor(tournament, target, round) : [];
  const count = setup.setup.course.par.length; const shownHole = Math.min(hole, count);
  const scope = tournamentEntryScope(tournament.id, round, shownHole, mode, mode === "own" ? me : target);
  const saved = mode === "own" ? own[shownHole - 1] : attested[shownHole - 1];
  async function send(action: object) {
    if (needsRefresh || busy) return;
    setBusy(true); setMessage("");
    const outcome = await saveTournamentScore(async () => {
      const reply = await apiJson<Record<string, unknown>>(`/api/app/code-tournaments/${encodeURIComponent(tournament.id)}`, { method: "POST", body: action });
      return reply.ok ? { ok: true } : { ok: false, error: reply.error };
    }, reload);
    if (outcome.saved) setValue("");
    setNeedsRefresh(outcome.needsRefresh); setMessage(outcome.message); setBusy(false);
  }
  async function refreshScores() {
    setBusy(true);
    const refreshed = await reload().catch(() => false);
    setNeedsRefresh(!refreshed);
    setMessage(refreshed ? "Scores refreshed. Check the saved score before continuing." : "Could not refresh scores. Try again when connected.");
    setBusy(false);
  }
  function save() {
    if (draftScope !== scope) { setMessage("The round or attestation assignment changed. Check the player and re-enter the score."); return; }
    const n = Number(value);
    if (!/^\d+$/.test(value.trim()) || !Number.isInteger(n) || n < 1 || n > 20) { setMessage("Enter a whole number from 1 to 20."); return; }
    if (mode === "attest" && !target) return;
    void send(mode === "own" ? { action: "strokes", round, hole: shownHole, strokes: n } : { action: "attest", round, hole: shownHole, player: target, strokes: n });
  }
  return <View style={styles.panel}><Text style={styles.heading}>Score · Round {round}</Text>
    <View style={styles.row}><Button label="My card" disabled={busy} onPress={() => { setMode("own"); setValue(""); setMessage(""); }} />{target && <Button label={`Attest ${targetName ?? "player"}`} disabled={busy} onPress={() => { setMode("attest"); setValue(""); setMessage(""); }} />}</View>
    <View style={styles.row}><Button label="Previous" disabled={busy || shownHole <= 1} onPress={() => { setHole(shownHole - 1); setValue(""); setMessage(""); }} /><Text style={styles.text}>Hole {shownHole} · Par {setup.setup.course.par[shownHole - 1]}</Text><Button label="Next" disabled={busy || shownHole >= count} onPress={() => { setHole(shownHole + 1); setValue(""); setMessage(""); }} /></View>
    <Text style={styles.text}>Saved score: {saved ?? "—"}</Text>
    {mode === "attest" && !target && <Text style={styles.text}>Your attestation assignment changed. Choose My card to continue.</Text>}
    {value && draftScope !== scope ? <Text accessibilityRole="alert" style={styles.problem}>The round or assignment changed. Check the player and re-enter the score.</Text> : null}
    <Text style={styles.text}>{mode === "own" ? (attester ? `Your attester: ${tournament.players.find(p => p.profileId === attester)?.name ?? "Player"}` : "No attester for this round.") : `Comparing your entries with ${targetName ?? "the player"}'s card.`}</Text>
    <View style={styles.cards}>{setup.setup.course.par.map((par, i) => {
      const score = mode === "own" ? own[i] : targetOwn[i];
      const check = mode === "own" ? attesterCard[i] : attested[i];
      const state = tournamentHoleStatus(score ?? null, check ?? null, mode === "own" ? !!attester : true);
      return <Pressable accessibilityRole="button" accessibilityLabel={`Hole ${i + 1}, par ${par}, player ${score ?? "no score"}, attester ${check ?? "no score"}, ${state}`} key={i} disabled={busy} onPress={() => { setHole(i + 1); setValue(""); setMessage(""); }} style={[styles.holeCard, shownHole === i + 1 && styles.activeHole]}>
        <Text style={styles.text}>Hole {i + 1} · Par {par}</Text><Text style={styles.text}>Player {score ?? "—"} · Attest {check ?? "—"}</Text>
        <Text style={state === "mismatch" ? styles.problem : styles.muted}>{state === "mismatch" ? "Does not match" : state === "waiting" ? "Waiting" : state === "match" ? "Matches" : state === "recorded" ? "Recorded" : "Not entered"}</Text>
      </Pressable>;
    })}</View>
    {needsRefresh && <Button label="Refresh scores" disabled={busy} onPress={() => void refreshScores()} />}
    {mode === "own" && locked ? <Text style={styles.text}>Your card has been submitted.</Text> : <><TextInput accessibilityLabel="Strokes" value={value} onChangeText={text => { setValue(text); setDraftScope(scope); }} keyboardType="number-pad" placeholder="Strokes" style={styles.input} /><View style={styles.row}><Button label="Save score" disabled={busy || needsRefresh || (mode === "attest" && !target)} onPress={save} /><Button label="Clear score" disabled={busy || needsRefresh || saved == null || (mode === "attest" && !target)} onPress={() => void send(mode === "own" ? { action: "strokes", round, hole: shownHole, strokes: null } : { action: "attest", round, hole: shownHole, player: target, strokes: null })} /></View></>}
    {mode === "own" && !locked && <><Text style={styles.text}>{attestAgrees(tournament, me, round) ? "Attestation matches." : "Your attester's scores don't match yours yet."}</Text><Button label="Submit my card" disabled={busy || needsRefresh || own.some(s => s == null) || !attestAgrees(tournament, me, round)} onPress={() => void send({ action: "submit", round })} /></>}
    {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
  </View>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ cards: { gap: 6 }, holeCard: { padding: 9, borderWidth: 1, borderColor: colors.line, borderRadius: 8 }, activeHole: { borderColor: colors.avatarGold, backgroundColor: colors.maroon700 }, muted: { fontFamily: fonts.regular, color: colors.cream, opacity: 0.75 }, problem: { fontFamily: fonts.bold, color: colors.errorOnMaroon }, panel: { gap: 12, marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.avatarGold }, heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.avatarGold }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }, button: { padding: 10, borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10 }, input: { backgroundColor: colors.white, color: colors.maroon900, fontSize: 18, borderRadius: 10, padding: 12 } });
