import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { CodeTournament, CodeTournamentLookup } from "@/lib/platform/codeTournaments";
import { TournamentSettings } from "~/components/tourneys/TournamentSettings.tsx";
import { TournamentScoring } from "~/components/tourneys/TournamentScoring.tsx";
import { TournamentDetail } from "~/components/tourneys/TournamentDetail.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { apiJson } from "~/lib/api.ts";
import { shownJoinCode, typedJoinCode } from "~/lib/play.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Screen = { kind: "code" } | { kind: "lookup"; tournament: CodeTournamentLookup } | { kind: "detail"; tournament: CodeTournament };
export function TournamentSheet({ visible, onClose, selectedId }: { visible: boolean; onClose: () => void; selectedId: string | null }) {
  const [screen, setScreen] = useState<Screen>({ kind: "code" });
  const [code, setCode] = useState("");
  const [handicap, setHandicap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const activeReads = useRef(0);

  const open = useCallback(async (id: string, silent = false) => {
    const version = ++requestVersion.current; activeReads.current++;
    if (!silent) setBusy(true);
    const reply = await apiJson<{ tournament: CodeTournament }>(`/api/app/code-tournaments/${encodeURIComponent(id)}`)
      .catch(() => ({ ok: false as const, error: "Could not reach the server.", code: null }));
    activeReads.current--;
    if (version !== requestVersion.current) return false;
    setBusy(false);
    if (reply.ok && reply.body.tournament) { setError(""); setScreen({ kind: "detail", tournament: reply.body.tournament }); return true; }
    else { if (!reply.ok && (reply.code === "not_member" || reply.code === "signed_out")) setScreen({ kind: "code" }); setError(!reply.ok && reply.code === "not_member" ? "You no longer have access to this tournament." : silent ? "Could not refresh scores. Try again when connected." : reply.ok ? "Could not load this tournament." : reply.error); return false; }
  }, []);
  useEffect(() => { if (visible && selectedId) void open(selectedId); }, [visible, selectedId, open]);
  const detailId = screen.kind === "detail" ? screen.tournament.id : null;
  useEffect(() => {
    if (!visible || !detailId) return;
    const refresh = () => { if (AppState.currentState === "active" && activeReads.current === 0) void open(detailId, true); };
    const timer = setInterval(refresh, 5000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [visible, detailId, open]);
  async function lookup() {
    if (code.length !== 6) { setError("Enter the 6-character tournament code."); return; }
    const version = ++requestVersion.current;
    setBusy(true); setError("");
    const reply = await apiJson<{ tournament: CodeTournamentLookup | null }>(`/api/app/code-tournaments/lookup?code=${encodeURIComponent(code)}`);
    if (version !== requestVersion.current) return;
    setBusy(false);
    if (!reply.ok) setError(reply.error);
    else if (!reply.body.tournament) setError("No tournament has that code. Check it with your organizer.");
    else setScreen({ kind: "lookup", tournament: reply.body.tournament });
  }
  async function join(t: CodeTournamentLookup) {
    const value = Number(handicap);
    if (t.scoring === "Net" && (!handicap.trim() || !Number.isFinite(value) || value < -10 || value > 54)) { setError("Enter a handicap index from -10 to 54."); return; }
    const version = ++requestVersion.current;
    setBusy(true); setError("");
    const reply = await apiJson<{ id: string }>("/api/app/code-tournaments/join", { method: "POST", body: { code, handicap: t.scoring === "Net" ? value : null } });
    if (version !== requestVersion.current) return;
    setBusy(false);
    if (reply.ok && reply.body.id) await open(reply.body.id);
    else setError(reply.ok ? "Couldn't open the tournament." : reply.error);
  }
  function close() { requestVersion.current++; setBusy(false); setScreen({ kind: "code" }); setCode(""); setHandicap(""); setError(""); onClose(); }
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <View style={styles.page}><View style={styles.header}><Text style={styles.title}>{screen.kind === "code" ? "Join a Tournament" : screen.tournament.name}</Text><SheetClose onPress={close} /></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {busy && <Text style={styles.text}>Loading…</Text>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {screen.kind === "code" && !selectedId && <><Text style={styles.text}>Enter the code from your organizer.</Text><TextInput accessibilityLabel="Tournament code" value={shownJoinCode(code)} onChangeText={v => { setCode(typedJoinCode(v)); setError(""); }} autoCapitalize="characters" autoCorrect={false} maxLength={7} placeholder="Join code" style={styles.input} /><Button label="Find tournament" disabled={busy} onPress={() => void lookup()} /></>}
        {screen.kind === "lookup" && <><Text style={styles.text}>Organized by {screen.tournament.organizerName} · {screen.tournament.scoring} · {screen.tournament.playerCount} players</Text>
          {screen.tournament.rounds.map(r => <Text key={r.number} style={styles.text}>Round {r.number} · {r.course} · {r.date}</Text>)}
          {screen.tournament.member ? <Button label="Open tournament" disabled={busy} onPress={() => void open(screen.tournament.id)} /> : screen.tournament.status === "ended" ? <Text style={styles.text}>This tournament has ended.</Text> : <>
            {screen.tournament.scoring === "Net" && <><Text style={styles.text}>Your handicap index</Text><TextInput accessibilityLabel="Handicap index" value={handicap} onChangeText={setHandicap} keyboardType="numbers-and-punctuation" placeholder="e.g. 12.3" style={styles.input} /></>}
            <Button label="Join tournament" disabled={busy} onPress={() => void join(screen.tournament)} /></>}
          <Button label="Try another code" disabled={busy} onPress={() => { setScreen({ kind: "code" }); setError(""); }} /></>}
        {screen.kind === "detail" && <><TournamentDetail tournament={screen.tournament} busy={busy} refresh={() => void open(screen.tournament.id)} onOpenProfile={username => { close(); setTimeout(() => router.push({ pathname: "/profile/[username]", params: { username } }), 500); }} /><TournamentScoring tournament={screen.tournament} reload={() => open(screen.tournament.id)} /><TournamentSettings tournament={screen.tournament} reload={async () => { await open(screen.tournament.id); }} onDeleted={close} /></>}
      </ScrollView>
    </View>
  </Modal>;
}
function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900, padding: gutter },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  title: { flex: 1, fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  content: { paddingVertical: 20, gap: 16 }, text: { fontFamily: fonts.regular, fontSize: 16, color: colors.cream },
  subheading: { fontFamily: fonts.bold, fontSize: 18, color: colors.avatarGold },
  error: { fontFamily: fonts.regular, fontSize: 15, color: colors.cream },
  input: { backgroundColor: colors.white, borderRadius: 12, padding: 14, fontSize: 18, color: colors.maroon900 },
  button: { alignItems: "center", borderRadius: 12, padding: 15, backgroundColor: colors.avatarGold },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, color: colors.maroon900 },
});
