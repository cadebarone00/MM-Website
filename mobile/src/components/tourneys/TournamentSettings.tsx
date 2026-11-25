import { useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { formatCode, type CodeTournament, type TournamentCut } from "@/lib/platform/codeTournaments";
import { liveSettingsFrom, type LiveVisibility } from "@/lib/platform/liveVisibility";
import { TournamentDocuments } from "~/components/tourneys/TournamentDocuments.tsx";
import { TournamentTeeEditor } from "~/components/tourneys/TournamentTeeEditor.tsx";
import { apiJson } from "~/lib/api.ts";
import { useAuth } from "~/lib/auth.tsx";
import { colors, fonts } from "~/lib/theme.ts";

export function TournamentSettings({ tournament, reload }: { tournament: CodeTournament; reload: () => Promise<void> }) {
  const { session } = useAuth();
  const [expanded, setExpanded] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"none" | "top" | "score">(tournament.cut?.kind ?? "none");
  const [cutValue, setCutValue] = useState(tournament.cut ? String(tournament.cut.value) : "");
  const [after, setAfter] = useState(tournament.cut?.after ?? 1);
  if (session?.user.id !== tournament.organizer) return null;
  const visibility = liveSettingsFrom(tournament.liveVisibility, tournament.livePlayersCanShare, tournament.isPublic ? "public" : "private");
  async function send(body: object) {
    setBusy(true); setMessage("");
    const result = await apiJson<Record<string, unknown>>(`/api/app/code-tournaments/${encodeURIComponent(tournament.id)}`, { method: "POST", body });
    if (result.ok) { setMessage("Saved."); await reload(); } else setMessage(result.error);
    setBusy(false);
  }
  function changeVisibility(next: LiveVisibility, playersCanShare: boolean) {
    const apply = () => void send({ action: "visibility", visibility: next, playersCanShare });
    if (next === "public" && visibility.visibility !== "public") Alert.alert("Make tournament public?", "Anyone can find this tournament and view its public leaderboard.", [{ text: "Cancel", style: "cancel" }, { text: "Make public", onPress: apply }]); else apply();
  }
  function saveCut() {
    let cut: TournamentCut | null = null;
    if (kind !== "none") {
      const text = cutValue.trim(); const n = text.toUpperCase() === "E" ? 0 : Number(text);
      if (tournament.rounds.length < 2 || !/^[+-]?\d+$|^E$/i.test(text) || !Number.isInteger(n) || (kind === "top" ? n < 1 || n > 500 : n < -50 || n > 100) || after < 1 || after >= tournament.rounds.length) { setMessage("Enter a valid cut and choose a round before the final round."); return; }
      cut = { kind, value: n, after };
    }
    void send({ action: "cut", cut });
  }
  return <View style={styles.panel}><Button label={expanded ? "Close organizer settings" : "Organizer settings"} disabled={busy} onPress={() => setExpanded(!expanded)} />
    {expanded && <><Text style={styles.heading}>Tournament code · {formatCode(tournament.code)}</Text><View style={styles.row}><Button label="Copy code" disabled={busy} onPress={() => { void Clipboard.setStringAsync(formatCode(tournament.code)).then(() => setMessage("Code copied."), () => setMessage("Couldn't copy code.")); }} /><Button label="Share code" disabled={busy} onPress={() => { void Share.share({ message: `Join ${tournament.name} on The Maroon: open Tourneys and enter code ${formatCode(tournament.code)}` }).catch(() => setMessage("Couldn't share code.")); }} /></View>
      <Text style={styles.heading}>Who can watch</Text><Text style={styles.text}>Current: {visibility.visibility}</Text><View style={styles.row}>{(["private", "link", "public"] as const).map(v => <Button key={v} label={v === "link" ? "Link only" : v === "public" ? "Public" : "Private"} selected={visibility.visibility === v} disabled={busy} onPress={() => changeVisibility(v, visibility.playersCanShare)} />)}</View>
      <View style={styles.row}><Text style={styles.text}>Players can share the live link</Text><Switch accessibilityLabel="Players can share the live link" disabled={busy} value={visibility.playersCanShare} onValueChange={v => changeVisibility(visibility.visibility, v)} /></View>
      {tournament.watchCode && visibility.visibility !== "private" && <Text style={styles.text}>Watch code: {tournament.watchCode}</Text>}
      <TournamentTeeEditor tournament={tournament} reload={reload} />
      <TournamentDocuments tournament={tournament} reload={reload} />
      <Text style={styles.heading}>Cut</Text>{tournament.rounds.length < 2 ? <Text style={styles.text}>A cut needs two or more rounds.</Text> : <><View style={styles.row}>{(["none", "top", "score"] as const).map(k => <Button key={k} label={k === "none" ? "No cut" : k === "top" ? "Top players" : "Cut number"} disabled={busy || tournament.status !== "live"} selected={kind === k} onPress={() => setKind(k)} />)}</View>{kind !== "none" && <><TextInput accessibilityLabel={kind === "top" ? "Players making the cut" : "Cut score to par"} value={cutValue} onChangeText={setCutValue} placeholder={kind === "top" ? "Number of players" : "e.g. +4 or E"} style={styles.input} /><Text style={styles.text}>Cut after round</Text><View style={styles.row}>{tournament.rounds.slice(0, -1).map(r => <Button key={r.number} label={String(r.number)} selected={after === r.number} disabled={busy || tournament.status !== "live"} onPress={() => setAfter(r.number)} />)}</View></>}<Button label="Save cut" disabled={busy || tournament.status !== "live"} onPress={saveCut} /></>}
      {tournament.status === "live" && <Button label="End tournament" disabled={busy} onPress={() => Alert.alert("End tournament?", "Scores will lock and the event moves to past tournaments.", [{ text: "Cancel", style: "cancel" }, { text: "End tournament", style: "destructive", onPress: () => void send({ action: "end" }) }])} />}
      {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
    </>}
  </View>;
}
function Button({ label, disabled, selected, onPress }: { label: string; disabled: boolean; selected?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: !!selected }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ panel: { gap: 12, borderTopWidth: 1, borderTopColor: colors.avatarGold, paddingTop: 16 }, heading: { fontFamily: fonts.bold, color: colors.avatarGold, fontSize: 18 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, button: { padding: 10, borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10 }, selected: { backgroundColor: colors.maroon700 }, input: { backgroundColor: colors.white, color: colors.maroon900, padding: 12, borderRadius: 10 } });
