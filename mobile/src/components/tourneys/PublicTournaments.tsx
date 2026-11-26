import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { publicSection, type CodeTournament, type PublicCodeTournament } from "@/lib/platform/codeTournaments";
import { SheetClose } from "~/components/SheetClose.tsx";
import { TournamentDetail } from "~/components/tourneys/TournamentDetail.tsx";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Results = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; items: PublicCodeTournament[] };
export function PublicTournaments() {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [results, setResults] = useState<Results>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CodeTournament | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const activeReads = useRef(0);
  const validDate = !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date);
  useEffect(() => {
    if (!validDate) return;
    const controller = new AbortController();
    setResults({ kind: "loading" });
    const timer = setTimeout(() => { void apiJson<{ tournaments: PublicCodeTournament[] }>(`/api/app/code-tournaments/public?q=${encodeURIComponent(query.trim())}${date ? `&date=${date}` : ""}`, { signal: controller.signal }).then(reply => {
      if (controller.signal.aborted) return;
      setResults(reply.ok && Array.isArray(reply.body.tournaments) ? { kind: "ready", items: reply.body.tournaments } : { kind: "error", message: reply.ok ? "Couldn't load tournaments." : reply.error });
    }); }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, date, retry, validDate]);
  const open = useCallback(async (id: string, silent = false) => {
    const version = ++request.current; activeReads.current++; if (!silent) setBusy(true);
    const reply = await apiJson<{ tournament: CodeTournament }>(`/api/app/code-tournaments/public/${encodeURIComponent(id)}`);
    activeReads.current--;
    if (version !== request.current) return;
    setBusy(false);
    if (reply.ok && reply.body.tournament) { setDetailError(""); setDetail(reply.body.tournament); }
    else { if (!reply.ok && (reply.code === "missing" || reply.code === "signed_out")) setDetail(null); setDetailError(!reply.ok && reply.code === "missing" ? "This tournament is no longer available." : silent ? "Could not refresh scores. Try again when connected." : reply.ok ? "Could not load this tournament." : reply.error); }
  }, []);
  useEffect(() => {
    if (!selected || !detail) return;
    const refresh = () => { if (AppState.currentState === "active" && activeReads.current === 0) void open(selected, true); };
    const timer = setInterval(refresh, 5000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [selected, detail?.id, open]);
  function close() { request.current++; setSelected(null); setDetail(null); setDetailError(""); setBusy(false); }
  const today = new Date().toLocaleDateString("en-CA");
  return <View style={styles.content}>
    <Text style={styles.heading}>FIND A TOURNAMENT</Text>
    <TextInput accessibilityLabel="Search tournaments by name or location" placeholder="Name or location" value={query} onChangeText={setQuery} maxLength={60} style={styles.input} />
    <TextInput accessibilityLabel="Tournament date, year month day" placeholder="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} style={styles.input} />
    {!validDate ? <Text style={styles.text}>Enter a valid date in YYYY-MM-DD format.</Text> : results.kind === "error" ? <><Text style={styles.text}>{results.message}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)}><Text style={styles.link}>Try again</Text></Pressable></> : (["Live", "Upcoming", "Past"] as const).map(section => {
      const items = results.kind === "ready" ? results.items.filter(t => publicSection(t, today) === section) : [];
      return <View key={section} style={styles.group}><Text style={styles.subheading}>{section} Tournaments</Text>{results.kind === "loading" ? <Text style={styles.text}>Loading…</Text> : !items.length ? <Text style={styles.text}>No {section.toLowerCase()} public tournaments found.</Text> : items.map(t => <Pressable accessibilityRole="button" key={t.id} onPress={() => { setSelected(t.id); void open(t.id); }} style={styles.row}><Text style={styles.name}>{t.name}</Text><Text style={styles.meta}>{[t.course, t.place, t.firstDate, `${t.playerCount} players`, t.scoring].filter(Boolean).join(" · ")}</Text></Pressable>)}</View>;
    })}
    <Modal visible={selected !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><View style={styles.sheet}><View style={styles.header}><Text style={styles.title}>{detail?.name ?? "Tournament"}</Text><SheetClose onPress={close} /></View><ScrollView contentContainerStyle={styles.sheetContent}>{busy && <Text style={styles.text}>Loading…</Text>}{detailError ? <><Text style={styles.text}>{detailError}</Text>{selected && <Pressable accessibilityRole="button" onPress={() => void open(selected)}><Text style={styles.link}>Try again</Text></Pressable>}</> : null}{detail && selected && <TournamentDetail tournament={detail} spectator busy={busy} refresh={() => void open(selected)} onOpenProfile={username => { close(); setTimeout(() => router.push({ pathname: "/profile/[username]", params: { username } }), 500); }} />}</ScrollView></View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 10 }, heading: { marginTop: 18, paddingHorizontal: 4, fontFamily: fonts.capsBold, fontSize: 12, letterSpacing: 1, color: colors.cream },
  input: { backgroundColor: colors.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.maroon900, fontSize: 16 },
  group: { gap: 8, marginTop: 12 }, subheading: { fontFamily: fonts.bold, color: colors.avatarGold, fontSize: 17 },
  row: { padding: 14, backgroundColor: colors.white, borderRadius: 12 }, name: { fontFamily: fonts.semibold, color: colors.maroon900, fontSize: 16 }, meta: { fontFamily: fonts.regular, color: colors.inkMuted, marginTop: 4 },
  text: { color: colors.cream, fontFamily: fonts.regular, fontSize: 15 }, link: { color: colors.avatarGold, fontFamily: fonts.bold, fontSize: 15 },
  sheet: { flex: 1, padding: gutter, backgroundColor: colors.maroon900 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { flex: 1, fontFamily: fonts.bold, fontSize: 22, color: colors.cream }, sheetContent: { paddingVertical: 20, gap: 12 },
});
