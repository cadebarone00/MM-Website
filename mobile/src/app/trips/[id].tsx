import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { AccessibilityInfo, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { localNow } from "@/lib/platform/golfTripItinerary";
import { GOLF_TRIP_TABS } from "@/lib/platform/golfTripNavigation";
import { tripHomeView } from "@/lib/platform/tripHome";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { TripHome } from "~/components/trips/TripHome.tsx";
import { TripChat } from "~/components/trips/TripChat.tsx";
import { RatePlaces, TripTips } from "~/components/trips/TripExtras.tsx";
import { TripFeed } from "~/components/trips/TripFeed.tsx";
import { SymbolView } from "expo-symbols";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, minTap } from "~/lib/theme.ts";
import { useInviteLink, useTripMomentum, useTripPage } from "~/lib/tripPage.ts";

type Tab = (typeof GOLF_TRIP_TABS)[number];

/** Where a later Golf Trips part picks up (a placeholder until then, so nothing goes nowhere). */
const LATER: Record<Exclude<Tab, "Home">, { part: string; note: string }> = {
  Golf: { part: "2d", note: "The Golf tab (Overview, Board, matches, games, stats, Predict) and trip scoring." },
  Venue: { part: "2f", note: "The Venue tab (places nearby, add to the itinerary)." },
  Itinerary: { part: "2f", note: "The day-by-day Itinerary, adding travel and plans." },
};
const openPart = (title: string, heading: string, part: string, note: string) => router.push({ pathname: "/trips/part", params: { title, heading, part, note } });

/**
 * The trip page (project_specs.md Golf Trips part 2c): header (← · name · gear), the Home · Golf · Venue · Itinerary tabs and
 * the Home tab. Data from /api/app/golf-trips/<id>, the same loader the website's trip page uses.
 */
export default function TripScreen() {
  useLightStatusBar();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { state, refreshing, reload } = useTripPage(id);
  const live = state.kind === "live" ? state.data : null;
  const momentum = useTripMomentum(live ? id : null);
  const invite = useInviteLink(live ? id : null);
  const [tab, setTab] = useState<Tab>("Home");
  const [sheet, setSheet] = useState<"feed" | "chat" | null>(null);
  // "Now" is read once, when Home opens (website rule), so plans don't jump while you look at them.
  const [now] = useState(() => localNow(new Date()));
  const view = useMemo(() => live ? tripHomeView(live, now, momentum) : null, [live, now, momentum]);
  const title = view?.tripName ?? (state.kind === "imported" ? state.name : name || "Golf trip");
  const settings = () => openPart("Trip settings", title, "2g", "Trip Settings (general, members and roles, games, pars, corrections, notifications, tips).");

  if (state.kind === "imported") { router.replace({ pathname: "/trips/part", params: { title: "Golf trip", heading: state.name, part: "2g", note: "The imported past trip page." } }); return null; }

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}>
        {live ? (
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <HeaderIcon icon="chevron.left" label="Back" onPress={() => router.back()} />
              <HeaderIcon icon="newspaper" label="Trip feed" onPress={() => setSheet("feed")} />
              <HeaderIcon icon="message" label="Trip chat" onPress={() => setSheet("chat")} />
            </View>
            <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
            <View style={[styles.headerSide, { justifyContent: "flex-end" }]}><HeaderIcon icon="gearshape" label="Trip settings" onPress={settings} /></View>
          </View>
        ) : <PageHeader title={title} back onBack={() => router.back()} tone="dark" />}
      </View>
      {live && <TabBar tab={tab} onChange={setTab} />}
      {state.kind === "loading" && <StateSlot state={{ kind: "loading" }} height={240} tone="dark" />}
      {state.kind === "not-found" && <Problem text="Trip not found. It may have been deleted, or you're not on it." action="Back to Golf Trips" onPress={() => router.back()} />}
      {state.kind === "signed-out" && <Problem text="You're signed out. Sign in again to see this trip." action="Sign in" onPress={() => router.replace("/sign-in")} />}
      {state.kind === "error" && <Problem text={state.message} action="Try again" onPress={() => void reload(true)} />}
      {view && (tab === "Home" ? (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload(true)} tintColor={colors.goldBright} />}>
          <TripHome view={view} invite={invite}
            onOpenItinerary={() => setTab("Itinerary")}
            onOpenFlights={() => openPart("Flights", title, "2f", "Your flights for this trip.")} onSettings={settings}
            onRoom={(which) => openPart(which === "selection" ? "Selection Room" : which === "robin" ? "Round robin" : "Draft Room", title, "2e",
              which === "selection" ? "Match Selection (picking each round's matches)." : which === "robin" ? "Entering round-robin results." : "The Team Draft room.")} />
        </ScrollView>
      ) : (
        <View style={styles.gutter}>
          <Card tone="dark" style={{ marginTop: 16 }}>
            <Text style={styles.laterHeading}>{tab}</Text>
            <Text style={styles.laterBody}>{LATER[tab].note} This comes to the new app in Golf Trips part {LATER[tab].part}; until then use the current Maroon app.</Text>
          </Card>
        </View>
      ))}
      {live && view && <>
        <TripFeed open={sheet === "feed"} onClose={() => setSheet(null)} />
        <TripChat open={sheet === "chat"} onClose={() => setSheet(null)} tripName={view.tripName}
          members={view.roster.players.map((p) => p.name).filter((n) => n !== live.savedTrip.members.find((m) => m.profileId === live.viewer.profileId)?.displayName)} />
        <TripTips profileId={live.viewer.profileId} isOrganizer={live.viewer.isOrganizer} />
        <RatePlaces tripId={id} visits={view.rateVisits} />
      </>}
    </SafeAreaView>
  );
}

function HeaderIcon({ icon, label, onPress }: { icon: "chevron.left" | "newspaper" | "message" | "gearshape"; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.headerIcon}><SymbolView name={icon} size={icon === "chevron.left" ? 20 : 22} tintColor={colors.onMaroon} /></Pressable>;
}

/** Home · Golf · Venue · Itinerary. A tap gives a small bump (none with Reduce Motion). */
function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const [bump] = useState(() => new Animated.Value(1));
  const [bumped, setBumped] = useState<Tab | null>(null);
  const press = async (name: Tab) => {
    onChange(name);
    if (await AccessibilityInfo.isReduceMotionEnabled()) return;
    setBumped(name);
    bump.setValue(1);
    Animated.sequence([Animated.timing(bump, { toValue: 1.05, duration: 110, useNativeDriver: true }), Animated.timing(bump, { toValue: 1, duration: 110, useNativeDriver: true })]).start();
  };
  return (
    <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Trip sections">
      {GOLF_TRIP_TABS.map((name) => (
        <Animated.View key={name} style={{ flex: 1, transform: [{ scale: bumped === name ? bump : 1 }] }}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => void press(name)} style={[styles.tab, tab === name && styles.tabOn]}>
            <Text style={[styles.tabText, tab === name && styles.tabTextOn]}>{name}</Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

function Problem({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  return (
    <View style={[styles.gutter, { marginTop: 24 }]}>
      <Card tone="dark">
        <Text style={styles.problem}>{text}</Text>
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.problemAction}><Text style={styles.problemActionText}>{action}</Text></Pressable>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  scroll: { paddingBottom: 48 },
  header: { height: 52, flexDirection: "row", alignItems: "center" },
  headerSide: { width: minTap * 3, flexDirection: "row", alignItems: "center" },
  headerIcon: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 20, color: colors.onMaroon },
  tabs: { flexDirection: "row", gap: 6, marginHorizontal: gutter, marginTop: 4, padding: 4, borderRadius: 999, backgroundColor: colors.inputOnMaroon, borderWidth: 1, borderColor: colors.avatarRing },
  tab: { height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: colors.cream },
  tabText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.boardInk },
  tabTextOn: { color: colors.maroon900 },
  laterHeading: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream, marginBottom: 6 },
  laterBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
  problem: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.cream },
  problemAction: { marginTop: 10, minHeight: minTap, justifyContent: "center" },
  problemActionText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.goldBright },
});
