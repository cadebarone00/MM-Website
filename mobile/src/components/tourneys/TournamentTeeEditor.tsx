import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { roundTeeSheet, type CodeTournament, type TeeSheet } from "@/lib/platform/codeTournaments";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts } from "~/lib/theme.ts";

/** Organizer can move players between groups and edit start times and holes. Server remains authoritative. */
export function TournamentTeeEditor({ tournament, reload }: { tournament: CodeTournament; reload: () => Promise<void> }) {
  const [round, setRound] = useState(tournament.rounds[0]?.number ?? 1);
  const [draft, setDraft] = useState<TeeSheet>(() => roundTeeSheet(tournament, tournament.rounds[0]?.number ?? 1));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  function choose(n: number) { setRound(n); setDraft(roundTeeSheet(tournament, n)); setMessage(""); }
  function move(id: string, from: number, to: number) {
    setDraft(old => { const groups = old.groups.map(g => ({ ...g, players: [...g.players] })); if (!groups[to] || groups[to].players.length >= 6) return old; groups[from].players = groups[from].players.filter(p => p !== id); groups[to].players.push(id); return { groups: groups.filter(g => g.players.length) }; });
  }
  function addGroup(id: string, from: number) {
    setDraft(old => { const groups = old.groups.map(g => ({ ...g, players: [...g.players] })); groups[from].players = groups[from].players.filter(p => p !== id); groups.push({ time: "", hole: 1, players: [id] }); return { groups: groups.filter(g => g.players.length) }; });
  }
  async function save() {
    if (draft.groups.some(g => !/^(([01]\d|2[0-3]):[0-5]\d)?$/.test(g.time) || !Number.isInteger(g.hole) || g.hole < 1 || g.hole > 18 || !g.players.length || g.players.length > 6)) { setMessage("Use a 24-hour tee time (HH:MM) and starting holes 1–18."); return; }
    setBusy(true); setMessage("");
    const reply = await apiJson<Record<string, unknown>>(`/api/app/code-tournaments/${encodeURIComponent(tournament.id)}`, { method: "POST", body: { action: "teeSheet", round, teeSheet: draft } });
    if (!reply.ok) setMessage(reply.error); else { setMessage("Tee sheet saved."); await reload(); }
    setBusy(false);
  }
  return <View style={styles.panel}><Text style={styles.heading}>Edit tee sheet</Text><View style={styles.row}>{tournament.rounds.map(r => <Button key={r.number} label={`Round ${r.number}`} disabled={busy} onPress={() => choose(r.number)} />)}</View>
    {draft.groups.length === 0 ? <Text style={styles.text}>No players yet.</Text> : draft.groups.map((g, i) => <View style={styles.group} key={i}><Text style={styles.heading}>Group {i + 1}</Text><View style={styles.row}><TextInput accessibilityLabel={`Group ${i + 1} tee time`} value={g.time} onChangeText={value => setDraft(old => ({ groups: old.groups.map((x, j) => j === i ? { ...x, time: value } : x) }))} placeholder="HH:MM" maxLength={5} style={styles.input} /><TextInput accessibilityLabel={`Group ${i + 1} starting hole`} value={String(g.hole)} onChangeText={value => setDraft(old => ({ groups: old.groups.map((x, j) => j === i ? { ...x, hole: Number(value) } : x) }))} keyboardType="number-pad" style={styles.input} /></View>
      {g.players.map(id => <View key={id} style={styles.group}><Text style={styles.text}>{tournament.players.find(p => p.profileId === id)?.name ?? "Player"}</Text><View style={styles.row}>{i > 0 && <Button label="Previous group" disabled={busy || draft.groups[i - 1].players.length >= 6} onPress={() => move(id, i, i - 1)} />}{i < draft.groups.length - 1 && <Button label="Next group" disabled={busy || draft.groups[i + 1].players.length >= 6} onPress={() => move(id, i, i + 1)} />}{g.players.length > 1 && <Button label="New group" disabled={busy} onPress={() => addGroup(id, i)} />}</View></View>)}
    </View>)}
    {!!draft.groups.length && <Button label="Save tee sheet" disabled={busy || tournament.status !== "live"} onPress={() => void save()} />}{message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
  </View>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ panel: { gap: 12, paddingVertical: 12 }, heading: { fontFamily: fonts.bold, color: colors.avatarGold, fontSize: 17 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, group: { gap: 8, paddingVertical: 6 }, button: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10, padding: 9 }, input: { minWidth: 75, color: colors.maroon900, backgroundColor: colors.white, borderRadius: 8, padding: 8 } });
