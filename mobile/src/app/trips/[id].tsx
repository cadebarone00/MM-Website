import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import type { SavedGolfTrip, GolfTripViewer } from "@/lib/platform/golfTripCreate";
import { homeTeamRoster, sortHomeRoster } from "@/lib/platform/homeRoster";
import { halves, upcomingSlides } from "@/lib/platform/bigBoard";
import { itineraryDay, itineraryTime, localNow, withGolfRounds } from "@/lib/platform/golfTripItinerary";
import { goingOnly, itineraryFor } from "@/lib/platform/tripTravel";
import type { TripTravel } from "@/lib/platform/tripTravel";
import { homeCompetitionSummary, teamGroups, yourTeam } from "@/lib/platform/homeCompetition";
import { homeMatchRounds } from "@/lib/platform/homeDraft";
import { roundScoringFrom } from "@/lib/platform/teamPoints";
import type { RoundCompSettings } from "@/lib/platform/roundCompetition";
import { homeRosterFull, tapInPath } from "@/lib/platform/tapIn";
import { Avatar } from "~/components/Avatar.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiJson, apiRaw, shareUrl } from "~/lib/api.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type PageData = { status: "live"; savedTrip: SavedGolfTrip; viewer: GolfTripViewer; setupSnapshot: { values: Record<string, unknown> }; planSnapshot: { travel: TripTravel } } | { status: "imported" };
type LinkData = { url?: string; expiresAt?: string; error?: string };
type Momentum = { id: string; title: string; detail?: string };
const tabs = ["Home", "Golf", "Venue", "Itinerary"] as const;
type Tab = typeof tabs[number];

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("Home");
  const [invite, setInvite] = useState<LinkData | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [events, setEvents] = useState<Momentum[]>([]);
  const [note, setNote] = useState("");
  const [slide, setSlide] = useState(0);
  const load = useCallback(async () => {
    if (!id) { setError("Trip not found."); setLoading(false); return; }
    setLoading(true); setError("");
    const result = await apiJson<{ ok: true; data: PageData }>(`/api/app/golf-trips/${encodeURIComponent(id)}`);
    if (result.ok) setData(result.body.data); else { setData(null); setError(result.error); }
    setLoading(false);
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useFocusEffect(useCallback(() => {
    if (!id || data?.status !== "live") return;
    let active = true;
    const refresh = async () => {
      const [link, momentum] = await Promise.all([
        apiRaw<LinkData>(`/api/golf-trips/${encodeURIComponent(id)}/join-link`),
        apiRaw<{ events?: Momentum[] }>(`/api/golf-trips/${encodeURIComponent(id)}/momentum`),
      ]);
      if (!active) return;
      if (link.status === 200 && link.body?.url) { setInvite(link.body); setInviteError(""); }
      else { setInvite(null); setInviteError(link.body?.error ?? "Couldn't get the invite link."); }
      if (momentum.status === 200) setEvents(momentum.body?.events ?? []);
    };
    void refresh(); const timer = setInterval(() => void refresh(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [id, data?.status]));
  const copyInvite = async () => {
    if (!id) return;
    const response = await apiRaw<LinkData>(`/api/golf-trips/${encodeURIComponent(id)}/join-link`);
    if (!response.body?.url || response.status !== 200) { setInviteError(response.body?.error ?? "Couldn't get the invite link."); return; }
    setInvite(response.body);
    try { await Clipboard.setStringAsync(response.body.url); setNote("Link copied"); } catch { setNote("Couldn't copy the link."); }
  };
  const copyWatch = async (path: string) => {
    try { await Clipboard.setStringAsync(shareUrl(path)); setNote("The Maroon Live link copied"); }
    catch { setNote("Couldn't copy the link. Open it and copy its address."); }
  };
  const shareWatch = async (path: string) => {
    try { await Share.share({ message: `Follow ${trip?.trip.name ?? "this trip"} on The Maroon Live: ${shareUrl(path)}` }); }
    catch { setNote("Couldn't share. Use Copy link."); }
  };
  const trip = data?.status === "live" ? data.savedTrip : null;
  const members = sortHomeRoster((trip?.members ?? []).filter(m => m.profileId && m.invitationStatus === "accepted").map(m => ({ name: m.displayName, avatarUrl: m.avatarUrl, username: m.username })));
  const watch = tapInPath(trip?.trip.watch_code);
  const setup = data?.status === "live" ? data.setupSnapshot.values : {};
  const types = setup.localCompetitionType as { individual: string | null; team: string | null } | undefined;
  const groups = teamGroups(setup.submittedTeams as number[][] | undefined, setup.teamPicks as Record<number, number> | undefined);
  const names = (trip?.members ?? []).filter(m => m.profileId && m.invitationStatus === "accepted").map(m => m.displayName);
  const teams = homeTeamRoster({ teamCompetition: !!types?.team, players: members, assignmentNames: names, groups, teamNames: setup.teamNames as string[] | undefined });
  const rounds = trip?.rounds.map(r => ({ number: r.roundNumber, dayNumber: r.dayNumber, date: r.playDate ?? "", course: r.courseName || "Course TBD" })) ?? [];
  const formats = setup.compFormats as Record<string, RoundCompSettings> | undefined;
  const matchRounds = types ? homeMatchRounds(setup, rounds, names.length) : [];
  const summary = types && trip ? homeCompetitionSummary({ types,
    scoring: roundScoringFrom(rounds, formats, setup.compRounds as Record<string, boolean> | undefined, Number(setup.playerTotal) || members.length),
    recordStandings: matchRounds.some(round => round.method === "Round Robin"),
    rounds: rounds.map(r => ({ ...r, format: formats?.[`${r.dayNumber - 1}-${rounds.filter(other => other.dayNumber === r.dayNumber).findIndex(other => other.number === r.number)}`]?.format })) }) : null;
  const viewerName = data?.status === "live" ? trip?.members.find(m => m.profileId === data.viewer.profileId)?.displayName : null;
  const assigned = summary ? yourTeam({ teamFormat: summary.teamFormat, me: viewerName, players: names, groups, teamNames: setup.teamNames as string[] | undefined }) : null;
  const travel = data?.status === "live" ? data.planSnapshot.travel : null;
  const itinerary = trip && travel ? goingOnly(withGolfRounds(itineraryFor(travel), trip.rounds.map(r => ({ number: r.roundNumber, date: r.playDate ?? "", course: r.courseName || "Course TBD" })))) : [];
  const slides = upcomingSlides(itinerary, localNow(new Date()));
  const currentSlide = slides[Math.min(slide, Math.max(0, slides.length - 1))];
  return <SafeAreaView style={styles.page} edges={["top"]}>
    <View style={styles.header}><PageHeader title={trip?.trip.name ?? "Golf trip"} back onBack={() => router.back()} onSettings={trip ? () => Alert.alert("Trip Settings", "Trip Settings comes in part 2g.") : undefined} /></View>
    {loading || error ? <StateSlot height={240} state={loading ? { kind: "loading" } : { kind: "error", message: error, onRetry: () => void load() }} /> : data?.status === "imported" ? <StateSlot height={240} state={{ kind: "empty", message: "Imported trips will be available in part 2g." }} /> : trip && <>
      <View style={styles.tabs}>{tabs.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={styles.tab}><Text style={[styles.tabText, tab === item && styles.selected]}>{item}</Text></Pressable>)}</View>
      {tab !== "Home" ? <StateSlot height={240} state={{ kind: "empty", message: `${tab} comes in a later part of Golf Trips.` }} /> : <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}><Text style={styles.label}>Your trip to</Text><Text style={styles.destination}>{trip.trip.destination || "Your trip"}</Text><Text style={styles.gold}>{trip.trip.start_date} – {trip.trip.end_date}</Text>
          <View style={styles.board}><Text style={styles.headingLight}>Momentum</Text>{events.length ? events.slice(0, 3).map(event => <View key={event.id}><Text style={styles.light}>{event.title}</Text>{event.detail ? <Text style={styles.mutedLight}>{event.detail}</Text> : null}</View>) : <Text style={styles.mutedLight}>Trip highlights will show here.</Text>}<View style={styles.divider}/><Text style={styles.headingLight}>Upcoming</Text>{currentSlide ? <><Pressable onPress={() => setTab("Itinerary")}><Text style={styles.gold}>{currentSlide.status}</Text><Text style={styles.light}>{currentSlide.item.title}</Text><Text style={styles.mutedLight}>{itineraryDay(currentSlide.item.startsAt)} · {currentSlide.item.timeTbd ? "Tee time TBD" : itineraryTime(currentSlide.item.startsAt)}</Text></Pressable><View style={styles.actions}><Pressable accessibilityLabel="Previous plan" onPress={() => setSlide(Math.max(0, slide - 1))}><Text style={styles.gold}>‹</Text></Pressable><Text style={styles.mutedLight}>{Math.min(slide + 1, slides.length)} / {slides.length}</Text><Pressable accessibilityLabel="Next plan" onPress={() => setSlide(Math.min(slides.length - 1, slide + 1))}><Text style={styles.gold}>›</Text></Pressable></View></> : <Text style={styles.mutedLight}>Nothing else coming up</Text>}</View>
        </View>
        <View style={styles.card}><Text style={styles.heading}>The Maroon Live</Text><Text style={styles.body}>Invite your peers to follow along.</Text>{watch ? <><Text style={styles.body} selectable>{watch}</Text><View style={styles.actions}><Pressable onPress={() => void Linking.openURL(shareUrl(watch)).catch(() => setNote("Couldn't open The Maroon Live."))}><Text style={styles.action}>View</Text></Pressable><Pressable onPress={() => void copyWatch(watch)}><Text style={styles.action}>Copy link</Text></Pressable><Pressable onPress={() => void shareWatch(watch)}><Text style={styles.action}>Share</Text></Pressable></View></> : <Text style={styles.body}>The Maroon Live link unavailable</Text>}<Text style={styles.muted} accessibilityLiveRegion="polite">{note}</Text></View>
        {(types?.team || types?.individual) && <View style={styles.card}><Text style={styles.heading}>Drafts</Text>{types.team && setup.teamSelection === "Draft" && <><Text style={styles.body}>Team Draft</Text><Text style={styles.muted}>{typeof setup.draftDate === "string" && setup.draftDate && typeof setup.draftTime === "string" && setup.draftTime ? `${setup.draftDate} · ${setup.draftTime}` : "No Date Set"}</Text></>}{matchRounds.map(round => <Text key={round.key} style={styles.body}>Round {round.number} · {round.course} · {round.method || "Match selection not set"}</Text>)}{setup.teamSelection !== "Draft" && !matchRounds.length && <Text style={styles.muted}>No drafts coming up</Text>}</View>}
        <View style={styles.card}><Text style={styles.heading}>{teams ? "Teams" : `Players ${trip.trip.expected_traveler_count ? `${members.length}/${trip.trip.expected_traveler_count}` : members.length}`}</Text>{!homeRosterFull(members.length, trip.trip.expected_traveler_count, !!teams) && <View><Text style={styles.body} selectable>{invite?.url ?? (inviteError || "Getting your link…")}</Text><Pressable disabled={!invite?.url} onPress={() => void copyInvite()}><Text style={styles.action}>Copy link</Text></Pressable></View>}{teams ? teams.map(team => <View key={team.name}><Text style={styles.action}>{team.name}</Text>{team.players.map((member, index) => <View key={`${member.name}-${index}`} style={styles.player}><Text style={styles.body}>{index + 1}</Text><Avatar name={member.name} photoUrl={member.avatarUrl} size={32} onLight /><View><Text style={styles.body}>{member.name}</Text>{member.username ? <Text style={styles.muted}>@{member.username}</Text> : null}</View></View>)}</View>) : members.length ? members.map((member, index) => <View key={`${member.name}-${index}`} style={styles.player}><Text style={styles.body}>{index + 1}</Text><Avatar name={member.name} photoUrl={member.avatarUrl} size={32} onLight /><View><Text style={styles.body}>{member.name}</Text>{member.username ? <Text style={styles.muted}>@{member.username}</Text> : null}</View></View>) : <Text style={styles.body}>Players show up here as they join the trip.</Text>}</View>
        <View style={styles.card}><Text style={styles.heading}>Competition</Text>{summary ? <><Text style={styles.body}>{summary.type}</Text>{summary.teamFormat && <Text style={styles.body}>Team format · {summary.teamFormat}</Text>}{summary.teamFormat && <Text style={styles.body}>{summary.teamFormat === "2 Teams" ? "Your team" : "Teammates"} · {assigned || "Not on a team yet"}</Text>}{summary.individualFormat && <Text style={styles.body}>Individual · {summary.individualFormat}</Text>}<Text style={styles.body}>Days · {summary.days}    Rounds · {summary.rounds.length}</Text>{summary.recordStandings && <Text style={styles.body}>Round robin standings · W-L-T / winning percentage</Text>}{summary.rounds.map(round => <Text style={styles.body} key={round.number}>Round {round.number} · {round.format} · {round.course}</Text>)}{summary.totalPoints !== null && summary.toWin !== null && <Text style={styles.body}>Total points · {halves(summary.totalPoints)}    To win · {halves(summary.toWin)}</Text>}</> : <Text style={styles.body}>{trip.trip.includes_tournament === "yes" ? "Team drafts, matches and skins will show here." : "No competition"}</Text>}</View>
        <Text style={styles.muted} accessibilityLiveRegion="polite">{note}</Text>
      </ScrollView>}
    </>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream }, header: { paddingHorizontal: gutter }, tabs: { flexDirection: "row", borderBottomWidth: 1, borderColor: colors.line }, tab: { flex: 1, alignItems: "center", paddingVertical: 12 }, tabText: { fontFamily: fonts.regular, color: colors.inkMuted, fontSize: 16 }, selected: { color: colors.maroon700, fontFamily: fonts.bold }, content: { paddingBottom: 30, gap: 16 }, hero: { backgroundColor: colors.maroon900, padding: gutter, gap: 6 }, label: { fontFamily: fonts.regular, color: colors.onMaroon, fontSize: 16 }, destination: { fontFamily: fonts.bold, color: colors.cream, fontSize: 26 }, gold: { fontFamily: fonts.semibold, color: colors.goldBright }, board: { borderColor: colors.gold, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, marginTop: 12 }, headingLight: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream }, light: { fontFamily: fonts.regular, color: colors.onMaroon, fontSize: 16 }, mutedLight: { fontFamily: fonts.regular, color: colors.boardInk }, divider: { height: 1, backgroundColor: colors.boardBorderSoft, marginVertical: 8 }, card: { marginHorizontal: gutter, padding: 16, borderRadius: 16, backgroundColor: colors.card, gap: 8 }, heading: { fontFamily: fonts.bold, color: colors.ink, fontSize: 20 }, body: { fontFamily: fonts.regular, color: colors.ink, fontSize: 16 }, muted: { fontFamily: fonts.regular, color: colors.inkMuted }, action: { fontFamily: fonts.semibold, color: colors.maroon700, paddingVertical: 10 }, actions: { flexDirection: "row", gap: 20 }, player: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
});

