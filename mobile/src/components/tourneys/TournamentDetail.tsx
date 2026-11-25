import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { cutStatus, roundTeeSheet, teeTimeLabel, tournamentPreview, type CodeTournament } from "@/lib/platform/codeTournaments";
import { rankLeaderboard } from "@/lib/platform/golfLeaderboardOrder";
import { colors, fonts } from "~/lib/theme.ts";

/** Uses the same leaderboard and tee-sheet calculations as the existing tournament page. */
export function TournamentDetail({ tournament, refresh, busy, spectator = false }: { tournament: CodeTournament; refresh: () => void; busy: boolean; spectator?: boolean }) {
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [documentError, setDocumentError] = useState("");
  const [tab, setTab] = useState<"Leaderboard" | "Tee Sheet">("Leaderboard");
  const round = tournament.rounds.find(r => r.number === roundNumber) ?? tournament.rounds[0];
  if (!round) return <Text style={styles.text}>No rounds have been scheduled.</Text>;
  const board = rankLeaderboard(tournamentPreview(tournament, round.number).leaderboard, { net: tournament.scoring === "Net" });
  const cut = cutStatus(tournament);
  const pdfUrl = (path: string) => { const base = process.env.EXPO_PUBLIC_SUPABASE_URL; return base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/tournament-docs/${path.split("/").map(encodeURIComponent).join("/")}` : null; };
  const openPdf = async (path: string) => { const url = pdfUrl(path); if (!url) { setDocumentError("This PDF is not available right now."); return; } try { await Linking.openURL(url); setDocumentError(""); } catch { setDocumentError("Could not open the PDF."); } };
  const groups = roundTeeSheet(tournament, round.number).groups;
  return <View style={styles.content}>
    <Text style={styles.text}>{tournament.scoring} · {tournament.status === "ended" ? "Ended" : "Current"} · {tournament.players.length} players</Text>
    <View style={styles.rounds}>{tournament.rounds.map(r => <Pressable accessibilityRole="button" accessibilityState={{ selected: r.number === round.number }} key={r.number} onPress={() => setRoundNumber(r.number)} style={[styles.pill, r.number === round.number && styles.selected]}><Text style={styles.text}>Round {r.number}</Text></Pressable>)}</View>
    <Text style={styles.title}>{round.setup.course.name}</Text><Text style={styles.text}>{round.date}</Text>
    <View style={styles.rounds}>{(spectator ? ["Leaderboard"] as const : ["Leaderboard", "Tee Sheet"] as const).map(name => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === name }} key={name} onPress={() => setTab(name)} style={[styles.pill, tab === name && styles.selected]}><Text style={styles.text}>{name}</Text></Pressable>)}</View>
    {!spectator && tournament.infoPdf && <Pressable accessibilityRole="link" onPress={() => void openPdf(tournament.infoPdf!)}><Text style={styles.link}>Open tournament info PDF</Text></Pressable>}
    {round.pinSheetPdf && <Pressable accessibilityRole="link" onPress={() => void openPdf(round.pinSheetPdf!)}><Text style={styles.link}>Open round {round.number} pin sheet PDF</Text></Pressable>}
    {documentError ? <Text accessibilityRole="alert" style={styles.text}>{documentError}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={refresh}><Text style={styles.link}>{busy ? "Refreshing…" : "Refresh scores"}</Text></Pressable>
    {tab === "Leaderboard" ? <>
      {cut && <Text style={styles.text}>{cut.final ? "Cut" : "Projected cut"} · {cut.cut.kind === "top" ? `Top ${cut.cut.value} & ties` : `Score ${cut.cut.value > 0 ? "+" : ""}${cut.cut.value}`}</Text>}
      {!board.length && <Text style={styles.text}>No players yet.</Text>}
      {board.map((row, index) => <View key={`${row.golfer.username ?? row.golfer.name}-${index}`} style={styles.row}><Text style={styles.position}>{row.position}</Text><View style={styles.nameBox}><Text style={styles.text}>{row.golfer.name}</Text><Text style={styles.muted}>Thru {row.thru}</Text></View><Text style={styles.text}>{tournament.scoring === "Net" ? row.netTotal : row.total}</Text></View>)}
    </> : groups.length ? groups.map((group, index) => <View key={index} style={styles.group}><Text style={styles.title}>{group.time ? teeTimeLabel(group.time) : "Tee time TBD"} · Hole {group.hole}</Text>{group.players.map(id => <Text key={id} style={styles.text}>{tournament.players.find(p => p.profileId === id)?.name ?? "Player"}</Text>)}</View>) : <Text style={styles.text}>No players yet.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 12 }, rounds: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }, selected: { backgroundColor: colors.maroon700 },
  text: { fontFamily: fonts.regular, fontSize: 16, color: colors.cream }, title: { fontFamily: fonts.bold, fontSize: 17, color: colors.avatarGold },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.avatarGold }, row: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.avatarGold, paddingVertical: 10 },
  position: { width: 35, fontFamily: fonts.bold, color: colors.avatarGold }, nameBox: { flex: 1 }, muted: { fontFamily: fonts.regular, color: colors.cream, opacity: 0.7 }, group: { gap: 8, paddingVertical: 8 },
});
