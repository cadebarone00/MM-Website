import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import type { CodeTournament, TournamentDocKind } from "@/lib/platform/codeTournaments";
import { apiJson } from "~/lib/api.ts";
import { parseJsonReply } from "~/lib/jsonReply.ts";
import { NETWORK_ERROR } from "~/lib/apiReply.ts";
import { supabase } from "~/lib/supabase.ts";
import { colors, fonts } from "~/lib/theme.ts";

export function TournamentDocuments({ tournament, reload }: { tournament: CodeTournament; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [round, setRound] = useState(tournament.rounds[0]?.number ?? 1);
  const selected = tournament.rounds.find(r => r.number === round) ?? tournament.rounds[0];
  const path = `/api/app/code-tournaments/${encodeURIComponent(tournament.id)}/documents`;
  async function upload(kind: TournamentDocKind) {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false, base64: false });
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (!file || (file.size !== undefined && (file.size <= 0 || file.size > 10 * 1024 * 1024))) { setMessage("Choose a PDF under 10 MB."); return; }
      const { data } = await supabase.auth.getSession(); const auth = data.session?.access_token;
      if (!auth) { setMessage("You're signed out. Sign in again."); return; }
      const form = new FormData(); form.append("kind", kind); if (kind === "pinSheet") form.append("round", String(selected.number));
      form.append("file", file.file ?? ({ uri: file.uri, name: file.name, type: "application/pdf" } as unknown as Blob));
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const base = (process.env.EXPO_PUBLIC_API_URL ?? "https://www.themaroon.site").replace(/\/$/, "");
        const response = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" }, body: form, signal: controller.signal });
        const result = parseJsonReply(response.status, await response.text());
        if (!result.ok) setMessage(result.error); else { setMessage("PDF saved."); await reload(); }
      } finally { clearTimeout(timer); }
    } catch { setMessage(NETWORK_ERROR); } finally { setBusy(false); }
  }
  async function remove(kind: TournamentDocKind) {
    setBusy(true); setMessage("");
    const suffix = `?kind=${kind}${kind === "pinSheet" ? `&round=${selected.number}` : ""}`;
    const result = await apiJson(path + suffix, { method: "DELETE" });
    if (!result.ok) setMessage(result.error); else { setMessage("PDF removed."); await reload(); }
    setBusy(false);
  }
  function confirmRemove(kind: TournamentDocKind) { Alert.alert("Remove PDF?", "This removes the document from the tournament.", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void remove(kind) }]); }
  return <View style={styles.panel}><Text style={styles.heading}>Tournament PDFs</Text><Text style={styles.text}>Info PDF {tournament.infoPdf ? "· uploaded" : "· none"}</Text>
    <View style={styles.row}><Button label={tournament.infoPdf ? "Replace info PDF" : "Upload info PDF"} disabled={busy} onPress={() => void upload("info")} />{tournament.infoPdf && <Button label="Remove" disabled={busy} onPress={() => confirmRemove("info")} />}</View>
    {selected && <><Text style={styles.text}>Pin sheet · Round {selected.number} {selected.pinSheetPdf ? "· uploaded" : "· none"}</Text><View style={styles.row}>{tournament.rounds.map(r => <Button key={r.number} label={`Round ${r.number}`} disabled={busy} onPress={() => setRound(r.number)} />)}</View><View style={styles.row}><Button label={selected.pinSheetPdf ? "Replace pin sheet" : "Upload pin sheet"} disabled={busy} onPress={() => void upload("pinSheet")} />{selected.pinSheetPdf && <Button label="Remove" disabled={busy} onPress={() => confirmRemove("pinSheet")} />}</View></>}
    {busy && <Text style={styles.text}>Working…</Text>}{message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
  </View>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ panel: { gap: 10, paddingVertical: 10 }, heading: { fontFamily: fonts.bold, color: colors.avatarGold, fontSize: 18 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10, padding: 10 } });
