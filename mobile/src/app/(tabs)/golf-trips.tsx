import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { splitGolfTrips, tripDateRange, type GolfTripSummary } from "@/lib/platform/golfTripCreate";
import { JoinCodeCard } from "~/components/play/JoinCodeCard.tsx";
import { AppHeader } from "~/components/AppHeader.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiJson, shareUrl } from "~/lib/api.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

type Load = { status: "loading" } | { status: "ok"; trips: GolfTripSummary[] } | { status: "signed-out" } | { status: "error" };

/**
 * Golf Trips (website GolfTripsView; project_specs.md "Expo app Step 2", part 2a): Create · Join, Balata Live,
 * then Upcoming and Past Trips (split by today in Chicago time with the shared splitGolfTrips). Pull down to refresh.
 */
export default function GolfTrips() {
  useLightStatusBar();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);

  const fetchTrips = useCallback(async () => {
    const reply = await apiJson<{ trips?: GolfTripSummary[] }>("/api/golf-trips");
    if (reply.ok && Array.isArray(reply.body.trips)) setLoad({ status: "ok", trips: reply.body.trips });
    else setLoad(!reply.ok && (reply.code === "unauthorized" || reply.code === "signed_out") ? { status: "signed-out" } : { status: "error" });
  }, []);
  useFocusEffect(useCallback(() => { void fetchTrips(); }, [fetchTrips]));
  const refresh = async () => { setRefreshing(true); await fetchTrips(); setRefreshing(false); };

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const { upcoming, past } = load.status === "ok" ? splitGolfTrips(load.trips, today) : { upcoming: [], past: [] };

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} />}>
        <Text style={styles.title} accessibilityRole="header">Golf Trips</Text>
        <View style={styles.actions}>
          <Action icon="plus" label="Create" onPress={() => router.push("/trips/new")} />
          <Action icon="link" label="Join" onPress={() => setJoining(true)} />
        </View>

        <Pressable accessibilityRole="link" accessibilityLabel="Balata Live. Check out other trips happening now" onPress={() => { Linking.openURL(shareUrl("/golf-trips/live")).catch(() => {}); }}
          style={({ pressed }) => [styles.live, pressed && styles.pressed]}>
          <View style={styles.liveText}>
            <Text style={styles.liveTitle}>Balata Live</Text>
            <Text style={styles.liveDescription}>Check out other trips happening now</Text>
          </View>
          <SymbolView name="chevron.right" size={18} tintColor={colors.avatarGold} />
        </Pressable>

        {load.status === "ok" ? (
          <>
            <Section heading="UPCOMING" trips={upcoming} icon="airplane"
              empty={<Row icon="airplane" name="No upcoming trip yet" value="Start +" onPress={() => router.push("/trips/new")} />} />
            <Section heading="PAST TRIPS" trips={past} icon="flag"
              action={<Pressable accessibilityRole="button" onPress={() => router.push("/trips/import")} hitSlop={8}><Text style={styles.headingAction}>Import past trip</Text></Pressable>}
              empty={<Row icon="flag" name="No past trips yet" />} />
          </>
        ) : (
          <View>
            <Text style={styles.heading}>MY TRIPS</Text>
            <View style={styles.card}>
              <StateSlot height={60} state={load.status === "loading" ? { kind: "loading" }
                : load.status === "signed-out" ? { kind: "empty", message: "Log in to see your trips" }
                : { kind: "error", message: "We couldn't load your trips.", onRetry: () => { setLoad({ status: "loading" }); void fetchTrips(); } }} />
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={joining} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setJoining(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetTop}><Text style={styles.sheetTitle}>Join a Trip</Text><SheetClose onPress={() => setJoining(false)} /></View>
          <JoinCodeCard kind="trip" onJoin={() => setJoining(false)} />
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

/** A small caps heading, then a white card of trip rows (or one empty row). */
function Section({ heading, trips, icon, empty, action }: { heading: string; trips: GolfTripSummary[]; icon: SymbolViewProps["name"]; empty: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View>
      <View style={styles.headingRow}><Text style={styles.heading}>{heading}</Text>{action}</View>
      <View style={styles.card}>
        {trips.length ? trips.map((trip, i) => (
          <View key={trip.id} style={i > 0 && styles.divider}>
            <Row icon={icon} name={trip.name} meta={[trip.destination, playerCount(trip), trip.role === "organizer" ? "Organizer" : "Member"].filter(Boolean).join(" · ")}
              value={tripDateRange(trip.startDate, trip.endDate).replace(/, \d{4}$/, "")} arrow
              onPress={() => router.push({ pathname: "/trips/[id]", params: { id: trip.id, name: trip.name } })} />
          </View>
        )) : empty}
      </View>
    </View>
  );
}

function Row({ icon, name, meta, value, arrow = false, onPress }: { icon: SymbolViewProps["name"]; name: string; meta?: string; value?: string; arrow?: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.iconBox}><SymbolView name={icon} size={17} tintColor={colors.maroon900} /></View>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{name}</Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {arrow && <SymbolView name="chevron.right" size={14} tintColor={colors.inkMuted} />}
    </Pressable>
  );
}

function playerCount(trip: GolfTripSummary): string {
  const count = trip.expectedTravelerCount ?? trip.memberCount;
  return `${count} ${count === 1 ? "player" : "players"}`;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.darkBackground },
  content: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 48, gap: 12 },
  title: { marginBottom: 8, textAlign: "center", fontFamily: fonts.regular, fontSize: 36, letterSpacing: -1, color: colors.cream },
  actions: { flexDirection: "row", gap: 12 },
  action: { flex: 1, minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "rgba(201,168,110,0.53)", borderRadius: 16 },
  actionText: { fontFamily: fonts.bold, fontSize: 17, color: colors.avatarGold },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  live: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 21, paddingHorizontal: 20, borderWidth: 1, borderColor: "rgba(201,168,110,0.53)", borderRadius: 20, backgroundColor: colors.darkBackground },
  liveText: { flex: 1, gap: 7 },
  liveTitle: { fontFamily: fonts.semibold, fontSize: 25, color: colors.avatarGold },
  liveDescription: { fontFamily: fonts.regular, fontSize: 14, color: colors.cream },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 8, paddingHorizontal: 4 },
  heading: { fontFamily: fonts.capsBold, fontSize: 12, letterSpacing: 1, color: "rgba(251,248,241,0.8)" },
  headingAction: { fontFamily: fonts.semibold, fontSize: 14, color: colors.avatarGold },
  card: { borderRadius: 20, backgroundColor: colors.white, overflow: "hidden" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 14 },
  rowPressed: { backgroundColor: "#faf7f2" },
  iconBox: { width: 34, height: 34, borderRadius: 9, borderWidth: 1.5, borderColor: "rgba(36,0,1,0.25)", alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon900 },
  rowMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  rowValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.maroon700 },
  sheet: { flex: 1, padding: gutter, gap: 16, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
});
