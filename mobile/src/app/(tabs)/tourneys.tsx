import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MyCodeTournament } from "@/lib/platform/codeTournaments";
import type { PastTournament } from "@/lib/platform/pastTournaments";
import { TournamentSheet } from "~/components/tourneys/TournamentSheet.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiGet } from "~/lib/api.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type History = { signedIn: false } | { signedIn: true; ok: false } | { signedIn: true; ok: true; tournaments: PastTournament[] };
type Home = { past: History; codeTournaments: MyCodeTournament[] };
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: Home };

export default function Tourneys() {
  useLightStatusBar();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [sheet, setSheet] = useState<{ visible: boolean; id: string | null }>({ visible: false, id: null });
  const [refreshing, setRefreshing] = useState(false);
  const fetchHome = useCallback(async () => {
    const result = await apiGet<Home>("/api/app/tourneys?view=join");
    setLoad(result.ok ? { status: "ok", data: result.data } : { status: "error", message: result.error });
  }, []);
  useFocusEffect(useCallback(() => { void fetchHome(); }, [fetchHome]));
  const refresh = async () => { setRefreshing(true); await fetchHome(); setRefreshing(false); };
  const current = load.status === "ok" ? load.data.codeTournaments.filter(t => t.status === "live") : [];
  const ended = load.status === "ok" ? load.data.codeTournaments.filter(t => t.status === "ended") : [];
  return <SafeAreaView style={styles.page} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} />}>
      <Text accessibilityRole="header" style={styles.title}>Tourneys</Text>
      <Pressable accessibilityRole="button" onPress={() => setSheet({ visible: true, id: null })} style={styles.join}><Text style={styles.joinText}>Join with code</Text></Pressable>
      {load.status !== "ok" ? <View style={styles.card}><StateSlot height={80} state={load.status === "loading" ? { kind: "loading" } : { kind: "error", message: load.message, onRetry: () => { setLoad({ status: "loading" }); void fetchHome(); } }} /></View> : <>
        <Text style={styles.heading}>CURRENT</Text>
        <View style={styles.card}>{current.length ? current.map(t => <Row onPress={() => setSheet({ visible: true, id: t.id })} key={t.id} name={t.name} detail={[t.course, t.firstDate].filter(Boolean).join(" · ")} />) : <Text style={styles.empty}>No current tournaments.</Text>}</View>
        <Text style={styles.heading}>PAST TOURNAMENTS</Text>
        <View style={styles.card}>
          {ended.map(t => <Row onPress={() => setSheet({ visible: true, id: t.id })} key={t.id} name={t.name} detail={[t.course, t.firstDate].filter(Boolean).join(" · ")} />)}
          {!load.data.past.signedIn ? <Text style={styles.empty}>Sign in to see your past tournaments.</Text> : !load.data.past.ok ? <Text style={styles.empty}>We couldn't load your past tournaments. Pull down to try again.</Text> : <>
            {load.data.past.tournaments.map(t => <Row key={`${t.href}-${t.year}`} name={`${t.name} ${t.year}`} detail={[t.destination, t.startDate].filter(Boolean).join(" · ")} />)}
            {!ended.length && !load.data.past.tournaments.length && <Text style={styles.empty}>No past tournaments yet.</Text>}
          </>}
        </View>
      </>}
    </ScrollView>
    <TournamentSheet visible={sheet.visible} selectedId={sheet.id} onClose={() => { setSheet({ visible: false, id: null }); void fetchHome(); }} />
  </SafeAreaView>;
}
function Row({ name, detail, onPress }: { name: string; detail: string; onPress?: () => void }) {
  return <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? "button" : undefined} style={styles.row}><Text style={styles.name}>{name}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</Pressable>;
}
const styles = StyleSheet.create({
  join: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 16, padding: 16, alignItems: "center" },
  joinText: { fontFamily: fonts.bold, fontSize: 16, color: colors.avatarGold },
  page: { flex: 1, backgroundColor: colors.maroon900 },
  content: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 48, gap: 12 },
  title: { marginBottom: 8, textAlign: "center", fontFamily: fonts.regular, fontSize: 36, letterSpacing: -1, color: colors.cream },
  heading: { marginTop: 18, paddingHorizontal: 4, fontFamily: fonts.capsBold, fontSize: 12, letterSpacing: 1, color: colors.cream },
  card: { borderRadius: 20, backgroundColor: colors.white, overflow: "hidden" },
  row: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon900 },
  detail: { marginTop: 3, fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  empty: { padding: 16, fontFamily: fonts.regular, fontSize: 15, color: colors.inkMuted },
});
