import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { inviteRows, type InviteRow } from "@/lib/platform/inviteImport";
import { supabase } from "~/lib/supabase.ts";
import { parseJsonReply } from "~/lib/jsonReply.ts";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts } from "~/lib/theme.ts";

type Preview = { invites: InviteRow[]; problems: { row: number; message: string }[]; missing: string[] };
type Response = { sent: number; failed: string[]; emailReady: boolean; links: { name: string; email: string; url: string }[] };
export function TournamentInvites({ tournamentId, net }: { tournamentId: string; net: boolean }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [handicap, setHandicap] = useState("");
  const [players, setPlayers] = useState<InviteRow[]>([]); const [result, setResult] = useState<Response | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null); const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  function add() {
    const existing = players.map(p => ({ Name: p.name, Email: p.email, Handicap: p.handicap ?? "" }));
    const checked = inviteRows([...existing, { Name: name, Email: email, Handicap: handicap }], net);
    if (checked.problems.length || checked.invites.length !== players.length + 1) { setMessage(checked.problems.at(-1)?.message ?? "Enter the player's name and email."); return; }
    setPlayers(checked.invites); setName(""); setEmail(""); setHandicap(""); setMessage("");
  }
  async function pickFile() {
    if (busy) return; setBusy(true); setMessage(""); setPreview(null); setFilename("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], copyToCacheDirectory: true, multiple: false, base64: false });
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (!file || !/\.(csv|xlsx|xls)$/i.test(file.name) || (file.size !== undefined && (file.size <= 0 || file.size > 5 * 1024 * 1024))) { setMessage("Choose a CSV or Excel file under 5 MB."); return; }
      const { data } = await supabase.auth.getSession(); const auth = data.session?.access_token;
      if (!auth) { setMessage("You are signed out. Sign in again."); return; }
      const form = new FormData(); form.append("file", file.file ?? ({ uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as unknown as Blob));
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60000);
      try {
        const base = (process.env.EXPO_PUBLIC_API_URL ?? "https://www.themaroon.site").replace(/\/$/, "");
        const response = await fetch(`${base}/api/app/code-tournaments/${encodeURIComponent(tournamentId)}/invites/preview`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" }, body: form, signal: controller.signal });
        const parsed = parseJsonReply<Preview>(response.status, await response.text());
        if (!parsed.ok) { setMessage(parsed.error); return; }
        if (!Array.isArray(parsed.body.invites) || !Array.isArray(parsed.body.problems) || !Array.isArray(parsed.body.missing)) { setMessage("Could not read that file."); return; }
        setFilename(file.name); setPreview(parsed.body);
      } finally { clearTimeout(timer); }
    } catch { setMessage("Could not read the file or reach Balata. Try again."); } finally { setBusy(false); }
  }
  function addImported() {
    if (!preview) return;
    const combined = [...players, ...preview.invites].map(p => ({ Name: p.name, Email: p.email, Handicap: p.handicap ?? "" }));
    const checked = inviteRows(combined, net);
    setPlayers(checked.invites); setPreview(null); setFilename("");
    setMessage(checked.problems.length ? `${checked.problems.length} duplicate or excess player entries were skipped.` : "Players added. Review the list before sending.");
  }
  async function send() {
    if (!players.length || busy) return;
    setBusy(true); setMessage("");
    const reply = await apiJson<Response>(`/api/app/code-tournaments/${encodeURIComponent(tournamentId)}/invites`, { method: "POST", body: { invites: players } });
    setBusy(false);
    if (!reply.ok) { setMessage(`${reply.error} Check invitation status before trying again.`); return; }
    const body = reply.body;
    if (!Array.isArray(body.links) || !Array.isArray(body.failed) || typeof body.sent !== "number") { setMessage("Could not confirm invitations. Check their status before retrying."); return; }
    setResult(body); setPlayers([]);
  }
  return <View style={styles.panel}><Text style={styles.heading}>Invite players</Text>{result ? <>
    <Text style={styles.text}>{result.emailReady ? `${result.sent} invitation${result.sent === 1 ? "" : "s"} emailed.` : "Email is not configured. Share the invitation links below."}</Text>
    {result.links.map(link => <View key={link.email} style={styles.person}><Text style={styles.text}>{link.name} · {link.email}{result.emailReady && result.failed.includes(link.email) ? " · Email failed" : ""}</Text><View style={styles.row}><Button label="Copy link" disabled={busy} onPress={() => { void Clipboard.setStringAsync(link.url).then(() => setMessage("Link copied."), () => setMessage("Could not copy link.")); }} /><Button label="Share link" disabled={busy} onPress={() => { void Share.share({ message: link.url }).catch(() => setMessage("Could not share link.")); }} /></View></View>)}
    <Button label="Invite more players" disabled={busy} onPress={() => { setResult(null); setMessage(""); }} />
  </> : <><Text style={styles.text}>Add each player’s name and email{net ? " and handicap" : ""}. Sending creates their invitation and may email them.</Text>
    <TextInput accessibilityLabel="Player name" value={name} onChangeText={setName} placeholder="Player name" style={styles.input} maxLength={80} /><TextInput accessibilityLabel="Player email" value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.input} />{net && <TextInput accessibilityLabel="Player handicap" value={handicap} onChangeText={setHandicap} placeholder="Handicap index" keyboardType="numbers-and-punctuation" style={styles.input} />}
    <Button label="Add player" disabled={busy} onPress={add} /><Button label={busy ? "Working..." : "Choose CSV or Excel file"} disabled={busy} onPress={() => void pickFile()} />{preview && <View style={styles.person}><Text style={styles.text}>{filename}: {preview.invites.length} valid player{preview.invites.length === 1 ? "" : "s"}.</Text>{preview.missing.length > 0 && <Text style={styles.error}>Missing columns: {preview.missing.join(", ")}</Text>}{preview.problems.map((problem, i) => <Text style={styles.error} key={i}>Row {problem.row}: {problem.message}</Text>)}{!!preview.invites.length && <Button label="Add valid players to list" disabled={busy} onPress={addImported} />}</View>}{players.map((player, i) => <View key={player.email} style={styles.row}><Text style={styles.personText}>{player.name} · {player.email}{net ? ` · ${player.handicap}` : ""}</Text><Button label="Remove" disabled={busy} onPress={() => setPlayers(old => old.filter((_, j) => i !== j))} /></View>)}
    {!!players.length && <Button label={busy ? "Sending..." : `Send ${players.length} invitation${players.length === 1 ? "" : "s"}`} disabled={busy} onPress={() => void send()} />}
  </>}{message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}</View>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ panel: { gap: 10, paddingVertical: 10 }, heading: { fontFamily: fonts.bold, color: colors.avatarGold, fontSize: 18 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, error: { fontFamily: fonts.regular, color: colors.errorOnMaroon, fontSize: 15 }, input: { backgroundColor: colors.white, color: colors.maroon900, borderRadius: 10, padding: 12 }, row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, person: { gap: 6 }, personText: { flex: 1, fontFamily: fonts.regular, color: colors.cream }, button: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10, padding: 10 } });
