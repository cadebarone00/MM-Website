import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { leagueSection, type MyLeague } from "@/lib/platform/leagues";
import { JoinCodeCard } from "~/components/play/JoinCodeCard.tsx";
import { AppHeader } from "~/components/AppHeader.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiJson } from "~/lib/api.ts";
import { dayLabel, playersText } from "~/lib/leaguesUi.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Load = { status: "loading" } | { status: "ok"; leagues: MyLeague[] } | { status: "error"; message: string };
const SECTIONS = [["Live", "LIVE"], ["Upcoming", "UPCOMING"], ["Past", "PAST"]] as const;

/**
 * Leagues (website LeaguesHome; project_specs.md "Expo app Step 5", part 5a): Create · Join with a code, then my leagues
 * under Live · Upcoming · Past (split with the shared leagueSection). Pull down to refresh. Laid out like Golf Trips.
 */
export default function Leagues() {
  useLightStatusBar();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);

  const fetchLeagues = useCallback(async () => {
    const r = await apiJson<{ leagues?: MyLeague[] }>("/api/leagues", { messages: { signed_out: "Log in to see your leagues.", not_installed: "Leagues aren't set up in the database yet." } });
    if (r.ok && Array.isArray(r.body.leagues)) setLoad({ status: "ok", leagues: r.body.leagues });
    else setLoad({ status: "error", message: r.ok ? "Couldn't load your leagues. Try again." : r.error });
  }, []);
  useFocusEffect(useCallback(() => { void fetchLeagues(); }, [fetchLeagues]));
  const refresh = async () => { setRefreshing(true); await fetchLeagues(); setRefreshing(false); };
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} />}>
        <Text style={styles.title} accessibilityRole="header">Leagues</Text>
        <View style={styles.actions}>
          <Action icon="plus" label="Create" onPress={() => router.push("/leagues/new")} />
          <Action icon="link" label="Join" onPress={() => setJoining(true)} />
        </View>

        {load.status !== "ok" ? (
          <View>
            <Text style={[styles.heading, styles.headingSpace]}>MY LEAGUES</Text>
            <View style={styles.card}>
              <StateSlot height={60} state={load.status === "loading" ? { kind: "loading" }
                : { kind: "error", message: load.message, onRetry: () => { setLoad({ status: "loading" }); void fetchLeagues(); } }} />
            </View>
          </View>
        ) : !load.leagues.length ? (
          <View>
            <Text style={[styles.heading, styles.headingSpace]}>MY LEAGUES</Text>
            <View style={[styles.card, styles.empty]}>
              <SymbolView name="person.3" size={26} tintColor={colors.maroon700} />
              <Text style={styles.emptyText}>No leagues yet. Create one, or join with the code from your organizer.</Text>
            </View>
          </View>
        ) : SECTIONS.map(([section, heading]) => {
          const rows = load.leagues.filter((l) => leagueSection(l, today) === section);
          if (!rows.length) return null;
          return (
            <View key={section}>
              <Text style={[styles.heading, styles.headingSpace]}>{heading}</Text>
              <View style={styles.card}>
                {rows.map((l, i) => (
                  <Pressable key={l.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/leagues/[id]", params: { id: l.id } })}
                    style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.rowPressed]}>
                    <View style={styles.iconBox}><SymbolView name={section === "Past" ? "flag" : "person.3"} size={16} tintColor={colors.maroon900} /></View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>{l.name}</Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>{`${l.course} · ${dayLabel(l.date)} · ${playersText(l.playerCount)}`}</Text>
                    </View>
                    <SymbolView name="chevron.right" size={14} tintColor={colors.inkMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={joining} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setJoining(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetTop}><Text style={styles.sheetTitle}>Join a League</Text><SheetClose onPress={() => setJoining(false)} /></View>
          <JoinCodeCard kind="league" onJoin={() => setJoining(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Action({ icon, label, onPress }: { icon: SymbolViewProps["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <SymbolView name={icon} size={17} tintColor={colors.avatarGold} weight="bold" />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.darkBackground },
  content: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 48, gap: 12 },
  title: { marginBottom: 8, textAlign: "center", fontFamily: fonts.regular, fontSize: 36, letterSpacing: -1, color: colors.cream },
  actions: { flexDirection: "row", gap: 12 },
  action: { flex: 1, minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: 16 },
  actionText: { fontFamily: fonts.bold, fontSize: 17, color: colors.avatarGold },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  heading: { fontFamily: fonts.capsBold, fontSize: 12, letterSpacing: 1, color: colors.wizardMuted },
  headingSpace: { marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 20, backgroundColor: colors.white, overflow: "hidden" },
  empty: { alignItems: "center", gap: 8, padding: 20 },
  emptyText: { textAlign: "center", fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.inkMuted },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 14 },
  rowPressed: { backgroundColor: colors.paper },
  iconBox: { width: 34, height: 34, borderRadius: 9, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon900 },
  rowMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  sheet: { flex: 1, padding: gutter, gap: 16, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
});
