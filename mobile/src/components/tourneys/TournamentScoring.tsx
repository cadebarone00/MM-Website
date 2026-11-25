import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { attestAgrees, attestCard, attestPairs, cardFor, currentRound, cutFrom, submitted, type CodeTournament } from "@/lib/platform/codeTournaments";
import { apiJson } from "~/lib/api.ts";
import { useAuth } from "~/lib/auth.tsx";
import { colors, fonts } from "~/lib/theme.ts";

/** Server-acknowledged, one-hole-at-a-time entry. Nothing is shown as saved before the server accepts it. */
export function TournamentScoring({ tournament, reload }: { tournament: CodeTournament; reload: () => Promise<void> }) {
  const { session } = useAuth(); const me = session?.user.id ?? null;
  const [hole, setHole] = useState(1); const [value, setValue] = useState("");
  const [mode, setMode] = useState<"own" | "attest">("own"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  if (!me || tournament.status !== "live" || !tournament.players.some(p => p.profileId === me) || !tournament.rounds.length) return null;
  const round = currentRound(tournament, me, new Date().toLocaleDateString("en-CA"));
  const setup = tournament.rounds.find(r => r.number === round); if (!setup) return null;
  if (cutFrom(tournament, me, round)) return <Text style={styles.text}>You missed the cut. Follow the rest of the tournament on the leaderboard.</Text>;
  const target = attestPairs(tournament, round).attesteeOf(me);
  const targetName = tournament.players.find(p => p.profileId === target)?.name;
  const locked = submitted(tournament, me, round);
  const own = cardFor(tournament, me, round); const attested = target ? attestCard(tournament, me, target, round) : [];
  const count = setup.setup.course.par.length; const shownHole = Math.min(hole, count);
  const saved = mode === "own" ? own[shownHole - 1] : attested[shownHole - 1];
  async function send(action: object) {
    setBusy(true); setMessage("");
    const reply = await apiJson<Record<string, unknown>>(`/api/app/code-tournaments/${encodeURIComponent(tournament.id)}`, { method: "POST", body: action });
    if (!reply.ok) { setMessage(`${reply.error} Refresh the tournament before retrying.`); setBusy(false); return; }
    setValue(""); setMessage("Saved."); await reload(); setBusy(false);
  }
  function save() {
    const n = Number(value);
    if (!/^\d+$/.test(value.trim()) || !Number.isInteger(n) || n < 1 || n > 20) { setMessage("Enter a whole number from 1 to 20."); return; }
    if (mode === "attest" && !target) return;
    void send(mode === "own" ? { action: "strokes", round, hole: shownHole, strokes: n } : { action: "attest", round, hole: shownHole, player: target, strokes: n });
  }
  return <View style={styles.panel}><Text style={styles.heading}>Score · Round {round}</Text>
    <View style={styles.row}><Button label="My card" disabled={busy} onPress={() => { setMode("own"); setValue(""); setMessage(""); }} />{target && <Button label={`Attest ${targetName ?? "player"}`} disabled={busy} onPress={() => { setMode("attest"); setValue(""); setMessage(""); }} />}</View>
    <View style={styles.row}><Button label="Previous" disabled={busy || shownHole <= 1} onPress={() => { setHole(shownHole - 1); setValue(""); setMessage(""); }} /><Text style={styles.text}>Hole {shownHole} · Par {setup.setup.course.par[shownHole - 1]}</Text><Button label="Next" disabled={busy || shownHole >= count} onPress={() => { setHole(shownHole + 1); setValue(""); setMessage(""); }} /></View>
    <Text style={styles.text}>Saved score: {saved ?? "—"}</Text>
    {mode === "own" && locked ? <Text style={styles.text}>Your card has been submitted.</Text> : <><TextInput accessibilityLabel="Strokes" value={value} onChangeText={setValue} keyboardType="number-pad" placeholder="Strokes" style={styles.input} /><View style={styles.row}><Button label="Save score" disabled={busy} onPress={save} /><Button label="Clear score" disabled={busy || saved == null} onPress={() => void send(mode === "own" ? { action: "strokes", round, hole: shownHole, strokes: null } : { action: "attest", round, hole: shownHole, player: target, strokes: null })} /></View></>}
    {mode === "own" && !locked && <><Text style={styles.text}>{attestAgrees(tournament, me, round) ? "Attestation matches." : "Your attester's scores don't match yours yet."}</Text><Button label="Submit my card" disabled={busy || own.some(s => s == null) || !attestAgrees(tournament, me, round)} onPress={() => void send({ action: "submit", round })} /></>}
    {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
  </View>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ panel: { gap: 12, marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.avatarGold }, heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.avatarGold }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }, button: { padding: 10, borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10 }, input: { backgroundColor: colors.white, color: colors.maroon900, fontSize: 18, borderRadius: 10, padding: 12 } });
