import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { AccessibilityInfo, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { localNow } from "@/lib/platform/golfTripItinerary";
import { GOLF_TRIP_TABS } from "@/lib/platform/golfTripNavigation";
import { tripDates } from "@/lib/platform/golfTripDraft";
import type { Place } from "@/lib/platform/venuePlaces";
import type { RoundRobinResults } from "@/lib/platform/roundRobin";
import { tripHomeView } from "@/lib/platform/tripHome";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { TripHome } from "~/components/trips/TripHome.tsx";
import { TripDraftRoom } from "~/components/trips/TripDraftRoom.tsx";
import { ImportedTrip } from "~/components/trips/ImportedTrip.tsx";
import { TripFlights } from "~/components/trips/TripFlights.tsx";
import { TripGolf } from "~/components/trips/TripGolf.tsx";
import { TripItinerary } from "~/components/trips/TripItinerary.tsx";
import { InvitePeople, TripTravelForm } from "~/components/trips/TripTravelForm.tsx";
import { TripSettings } from "~/components/trips/TripSettings.tsx";
import { TripVenue } from "~/components/trips/TripVenue.tsx";
import { TripRoundRobin } from "~/components/trips/TripRoundRobin.tsx";
import { TripSelectionRoom } from "~/components/trips/TripSelectionRoom.tsx";
import { TripScoringSheet, tripScoringNote } from "~/components/trips/TripScoringSheet.tsx";
import { TripChat } from "~/components/trips/TripChat.tsx";
import { RatePlaces, TripTips } from "~/components/trips/TripExtras.tsx";
import { TripFeed } from "~/components/trips/TripFeed.tsx";
import { SymbolView } from "expo-symbols";
import { PlayMenu } from "~/components/play/PlayMenu.tsx";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, minTap } from "~/lib/theme.ts";
import { useInviteLink, useTripMomentum, useTripPage } from "~/lib/tripPage.ts";
import { useTripPlans } from "~/lib/useTripPlans.ts";

type Tab = (typeof GOLF_TRIP_TABS)[number];


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
  // Part 2e: the draft rooms open over the trip page.
  const [room, setRoom] = useState<"draft" | "selection" | "robin" | null>(null);
  // Part 2f: my plans (Itinerary, Venue → Add to itinerary), Flights, and a place being added.
  const plans = useTripPlans(id, live?.planSnapshot ?? null);
  const [flightsOpen, setFlightsOpen] = useState(false);
  const [addingPlace, setAddingPlace] = useState<{ place: Place; done: () => void } | null>(null);
  const [invitingPlan, setInvitingPlan] = useState<string | null>(null);
  // "Now" is read once, when Home opens (website rule), so plans don't jump while you look at them.
  const [now] = useState(() => localNow(new Date()));
  const view = useMemo(() => live ? tripHomeView(live, now, momentum) : null, [live, now, momentum]);
  const title = view?.tripName ?? (state.kind === "imported" ? state.name : name || "Golf trip");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = () => setSettingsOpen(true);
  // The ☰ app menu replaces the back arrow; Exit trip lives inside it (owner 2026-11-26).
  const [menuOpen, setMenuOpen] = useState(false);

  // Part 2g slice 3: an imported past trip shows its results, read only.
  if (state.kind === "imported") return <SafeAreaView style={styles.page} edges={["top"]}><ImportedTrip data={state.data} onBack={() => router.back()} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}>
        {live ? (
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <Pressable accessibilityRole="button" accessibilityLabel="Open Menu" accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(true)} style={styles.headerIcon}>
                <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLine} />
              </Pressable>
              <HeaderIcon icon="newspaper" label="Trip feed" onPress={() => setSheet("feed")} />
              <HeaderIcon icon="message" label="Trip chat" onPress={() => setSheet("chat")} />
            </View>
            <Text style={styles.headerTitle} numberOfLines={2} accessibilityRole="header">{title}</Text>
            <View style={[styles.headerSide, { justifyContent: "flex-end" }]}><HeaderIcon icon="gearshape" label="Trip settings" onPress={settings} /></View>
          </View>
        ) : <PageHeader title={title} back onBack={() => router.back()} tone="dark" />}
      </View>
      {live && <TabBar tab={tab} onChange={setTab} />}
      <PlayMenu visible={menuOpen} onClose={() => setMenuOpen(false)} exit={{ label: "Exit trip", onPress: () => { setMenuOpen(false); router.back(); } }} />
      {state.kind === "loading" && <StateSlot state={{ kind: "loading" }} height={240} tone="dark" />}
      {state.kind === "not-found" && <Problem text="Trip not found. It may have been deleted, or you're not on it." action="Back to Golf Trips" onPress={() => router.back()} />}
      {state.kind === "signed-out" && <Problem text="You're signed out. Sign in again to see this trip." action="Sign in" onPress={() => router.replace("/start/log-in")} />}
      {state.kind === "error" && <Problem text={state.message} action="Try again" onPress={() => void reload(true)} />}
      {view && (tab === "Home" ? (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload(true)} tintColor={colors.goldBright} />}>
          <TripHome view={view} invite={invite}
            onOpenItinerary={() => setTab("Itinerary")}
            onOpenFlights={() => setFlightsOpen(true)} onSettings={settings}
            onRoom={setRoom} onOpenLive={() => setTab("Golf")} />
        </ScrollView>
      ) : tab === "Golf" ? (
        <TripGolf match={view.match} schedule={view.draft} structure={view.structure} viewerName={view.viewerName} roundLive={view.roundLive}
          playerStats={live!.setupSnapshot.values.playerStats === true} predict={view.predict} games={view.games} setup={live!.setupSnapshot.values as Record<string, unknown>}
          notice={live!.scoring?.profileId === live!.viewer.profileId ? tripScoringNote(live!.scoring.scoring, live!.viewer.profileId) : null} />
      ) : tab === "Venue" ? (
        <TripVenue tripId={id} destination={view.draft.destination ?? ""}
          center={Number.isFinite(Number(view.draft.destinationLatitude)) && Number.isFinite(Number(view.draft.destinationLongitude)) && view.draft.destinationLatitude && view.draft.destinationLongitude
            ? { latitude: Number(view.draft.destinationLatitude), longitude: Number(view.draft.destinationLongitude) } : null}
          onAddToItinerary={plans.available ? (place, done) => setAddingPlace({ place, done }) : undefined} />
      ) : (
        <TripItinerary tripId={id} plans={plans} rounds={view.rounds} tripDays={tripDates(view.draft.startDate, view.draft.endDate)}
          activeRound={view.roundLive ? view.match.round : undefined} refreshing={refreshing} onRefresh={() => void reload(true)} />
      ))}
      {live && view && <>
        <TripFeed open={sheet === "feed"} onClose={() => setSheet(null)} />
        <TripChat open={sheet === "chat"} onClose={() => setSheet(null)} tripName={view.tripName}
          members={view.roster.players.map((p) => p.name).filter((n) => n !== live.savedTrip.members.find((m) => m.profileId === live.viewer.profileId)?.displayName)} />
        <TripTips profileId={live.viewer.profileId} isOrganizer={live.viewer.isOrganizer} />
        <RatePlaces tripId={id} visits={view.rateVisits} />
        {settingsOpen && <TripSettings trip={live.savedTrip} draft={view.draft} viewer={{ profileId: live.viewer.profileId, memberId: live.savedTrip.members.find((m) => m.profileId === live.viewer.profileId)?.id ?? "", isOrganizer: live.viewer.isOrganizer }}
          setupValues={live.setupSnapshot.values as Record<string, unknown>} basis={live.setupSnapshot.basis} onChanged={() => void reload(true)}
          onClose={() => { setSettingsOpen(false); void reload(true); }} onLeft={() => { setSettingsOpen(false); router.replace("/(tabs)/golf-trips"); }} />}
        {flightsOpen && <TripFlights tripId={id} onClose={() => setFlightsOpen(false)} />}
        {addingPlace && <TripTravelForm kind="other" initial={{ name: addingPlace.place.name, place: addingPlace.place.address, placeId: addingPlace.place.id }} onClose={() => setAddingPlace(null)}
          onSave={(details, startsAt, endsAt, invite) => {
            const planId = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            plans.change({ type: "add", item: { id: planId, kind: "other", details: { ...details, placeId: addingPlace.place.id }, startsAt, endsAt, joinPolicy: "none" } });
            addingPlace.done(); setAddingPlace(null);
            if (invite) setInvitingPlan(planId);
          }} />}
        {invitingPlan && <InvitePeople travel={plans.travel} itemId={invitingPlan} onClose={() => setInvitingPlan(null)}
          onSend={(memberIds) => { plans.change({ type: "invite", id: invitingPlan, memberIds }); setInvitingPlan(null); }} />}
        {room === "draft" && <TripDraftRoom tripId={id} onSettings={() => { setRoom(null); settings(); }}
          when={view.drafts?.team?.kind === "board" ? view.drafts.team.countdown.when : null} target={view.drafts?.team?.kind === "board" ? view.drafts.team.countdown.target : null}
          onClose={() => { setRoom(null); void reload(true); }} />}
        {room === "selection" && <TripSelectionRoom tripId={id} rounds={view.drafts?.match?.rounds ?? []} initialRound={view.drafts?.match?.next?.key ?? null}
          onSettings={() => { setRoom(null); settings(); }} onGoToMatches={() => { setRoom(null); setTab("Golf"); void reload(true); }}
          onClose={() => { setRoom(null); void reload(true); }} />}
        {room === "robin" && view.drafts?.match?.robin?.ready && <TripRoundRobin tripId={id} sides={view.drafts.match.robin.sides} roster={view.drafts.match.robin.roster}
          courses={view.drafts.match.robin.courses} canEdit={view.isOrganizer}
          initial={live.setupSnapshot.values.roundRobinResults as RoundRobinResults | undefined}
          onClose={() => { setRoom(null); void reload(true); }} />}
        {/* Player & Attest (part 2d slice 3): today's round, for a seated member only; the sheet tucks into the bottom. */}
        {live.scoring && live.scoring.profileId === live.viewer.profileId && (tab === "Home" || tab === "Golf") &&
          <TripScoringSheet key={`${live.scoring.scoring.roundId}:${live.viewer.profileId}`} tripId={id} profileId={live.viewer.profileId} initial={live.scoring.scoring} initialCorrections={live.scoring.corrections} />}
      </>}
    </SafeAreaView>
  );
}

function HeaderIcon({ icon, label, onPress }: { icon: "newspaper" | "message" | "gearshape"; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.headerIcon}><SymbolView name={icon} size={24} tintColor={colors.white} /></Pressable>;
}

/** Home · Golf · Venue · Itinerary (TestFlight look): plain words, the chosen one cream with a soft glow and a gold line
 * under it, a faint line edge to edge under all four. A tap gives a small bump (none with Reduce Motion). */
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
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => void press(name)} style={styles.tab}>
            <Text style={[styles.tabText, tab === name && styles.tabTextOn]}>{name}</Text>
            <View style={[styles.tabLine, tab === name && styles.tabLineOn]} />
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
  header: { minHeight: 60, flexDirection: "row", alignItems: "center" },
  headerSide: { width: minTap * 3, flexDirection: "row", alignItems: "center" },
  headerIcon: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center", gap: 5 },
  menuLine: { width: 22, height: 2, borderRadius: 1, backgroundColor: colors.white },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 22, lineHeight: 25, letterSpacing: -0.4, color: colors.white },
  // The faint line runs edge to edge; the gold line of the chosen tab sits right on top of it.
  tabs: { flexDirection: "row", marginTop: 4, paddingHorizontal: gutter, borderBottomWidth: 2, borderBottomColor: "rgba(251,248,241,0.18)" },
  tab: { minHeight: 44, alignItems: "center", justifyContent: "center", marginBottom: -2 },
  tabText: { fontFamily: fonts.capsBold, fontSize: 15, letterSpacing: 0.3, color: "rgba(255,255,255,0.55)" },
  tabTextOn: { color: colors.cream, textShadowColor: "rgba(251,248,241,0.55)", textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  tabLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: "transparent" },
  tabLineOn: { backgroundColor: colors.avatarGold },
  laterHeading: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream, marginBottom: 6 },
  laterBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
  problem: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.cream },
  problemAction: { marginTop: 10, minHeight: minTap, justifyContent: "center" },
  problemActionText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.goldBright },
});
