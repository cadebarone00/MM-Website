import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { isTournamentInviteToken } from "@/lib/platform/inviteImport";
import { SheetClose } from "~/components/SheetClose.tsx";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Invite = { tournamentName: string; scoring: "Gross" | "Net"; status: "live" | "ended"; invitedName: string; handicap: number | null; organizerName: string | null };
function tokenFrom(input: string): string | null {
  const value = input.trim(); if (isTournamentInviteToken(value)) return value;
  try { const url = new URL(value); if (url.protocol !== "https:" || !["themaroon.site", "www.themaroon.site"].includes(url.hostname)) return null; const match = /^\/tournaments\/code\/invite\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname); return match && isTournamentInviteToken(match[1]) ? match[1] : null; } catch { return null; }
}
export function TournamentInvite({ visible, close, onOpen }: { visible: boolean; close: () => void; onOpen: (id: string) => void }) {
  const [input, setInput] = useState(""); const [invite, setInvite] = useState<Invite | null>(null); const [token, setToken] = useState(""); const [handicap, setHandicap] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const generation = useRef(0);
  async function lookup() {
    const found = tokenFrom(input); if (!found) { setError("Enter the tournament invitation link."); return; }
    const version = ++generation.current; setBusy(true); setError("");
    const result = await apiJson<{ invite: Invite | null }>(`/api/app/code-tournaments/invite/${encodeURIComponent(found)}`);
    if (version !== generation.current) return; setBusy(false);
    if (!result.ok) setError(result.error); else if (!result.body.invite) setError("This invitation isn't valid. Ask the organizer for the tournament code."); else { setToken(found); setInvite(result.body.invite); }
  }
  async function accept() {
    if (!invite) return; const needs = invite.scoring === "Net" && invite.handicap === null; const number = Number(handicap);
    if (needs && (!handicap.trim() || !Number.isFinite(number) || number < -10 || number > 54)) { setError("Enter a handicap index from -10 to 54."); return; }
    const version = ++generation.current; setBusy(true); setError("");
    const result = await apiJson<{ id?: string }>(`/api/app/code-tournaments/invite/${encodeURIComponent(token)}`, { method: "POST", body: { handicap: needs ? number : null } });
    if (version !== generation.current) return; setBusy(false);
    if (result.ok && result.body.id) { const id = result.body.id; finish(); onOpen(id); } else setError(result.ok ? "Couldn't open the tournament." : result.error);
  }
  function finish() { generation.current++; setInput(""); setInvite(null); setToken(""); setHandicap(""); setBusy(false); setError(""); close(); }
  return <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={finish}><View style={styles.page}><View style={styles.header}><Text style={styles.title}>Tournament invitation</Text><SheetClose onPress={finish} /></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {!invite ? <><Text style={styles.text}>Paste the invitation link you received.</Text><TextInput accessibilityLabel="Tournament invitation link" value={input} onChangeText={setInput} autoCapitalize="none" autoCorrect={false} placeholder="Invitation link" style={styles.input} /><Button label={busy ? "Looking up…" : "Open invitation"} disabled={busy} onPress={() => void lookup()} /></> : <><Text style={styles.title}>Join {invite.tournamentName}</Text><Text style={styles.text}>{invite.organizerName ? `${invite.organizerName} invited ${invite.invitedName}` : `For ${invite.invitedName}`} · {invite.scoring}</Text>{invite.status === "ended" ? <Text style={styles.text}>This tournament has ended.</Text> : <>{invite.scoring === "Net" && invite.handicap === null && <><Text style={styles.text}>Your handicap index</Text><TextInput accessibilityLabel="Handicap index" value={handicap} onChangeText={setHandicap} keyboardType="numbers-and-punctuation" style={styles.input} placeholder="e.g. 12.3" /></>}<Button label={busy ? "Joining…" : "Join tournament"} disabled={busy} onPress={() => void accept()} /></>}</>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView></View></Modal>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.maroon900, padding: gutter }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, content: { gap: 16, paddingVertical: 20 }, title: { fontFamily: fonts.bold, color: colors.cream, fontSize: 22 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 16 }, error: { fontFamily: fonts.regular, color: colors.errorOnMaroon, fontSize: 15 }, input: { color: colors.maroon900, backgroundColor: colors.white, borderRadius: 12, padding: 12 }, button: { padding: 12, borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 12, alignItems: "center" } });
