import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { golfSections, type GolfTripSection } from "@/lib/platform/golfTripNavigation";
import { savedTripPresentation } from "@/lib/platform/savedTripPresentation";
import type { TripRoundScoring } from "@/lib/platform/tripScoring";
import { Leaderboard } from "~/components/round/Leaderboard.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type TripResponse = { ok: true; data: { status: string; scoring?: { scoring: TripRoundScoring } | null } };
export function TripGolf({ trip, setup }: { trip: SavedGolfTrip; setup: Record<string, unknown> }) {
  const types = setup.localCompetitionType as { individual?: string | null; team?: string | null } | undefined;
  const structure = { individual: Boolean(types?.individual), team: Boolean(types?.team) };
  const sections = golfSections(structure, Boolean(setup.playerStats)).filter(section => !(structure.team && !structure.individual && section.id === "Overview"));
  const [section, setSection] = useState<GolfTripSection>(structure.team ? "Competition" : "Overview");
  const [round, setRound] = useState<number | null>(trip.rounds[0]?.roundNumber ?? null);
  const [scoring, setScoring] = useState<TripRoundScoring | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (round === null) { setScoring(null); setState("ready"); return; }
    let live = true; setState("loading"); setScoring(null);
    void apiJson<TripResponse>(`/api/app/golf-trips/${encodeURIComponent(trip.trip.id)}?round=${round}`).then(result => {
      if (!live) return;
      if (!result.ok) { setState("error"); return; }
      const received = result.body.data.scoring?.scoring;
      setScoring(received?.roundNumber === round ? received : null); setState("ready");
    });
    return () => { live = false; };
  }, [trip.trip.id, round, retry]);
  const selected = trip.rounds.find(item => item.roundNumber === round);
  const preview = savedTripPresentation(trip, scoring);
  const pars = scoring?.pars?.pars ?? [];
  return <ScrollView contentContainerStyle={styles.content}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{sections.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: section === item.id }} onPress={() => setSection(item.id)} style={styles.pill}><Text style={[styles.text, section === item.id && styles.selected]}>{item.label}</Text></Pressable>)}</ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{trip.rounds.map(item => <Pressable key={item.roundNumber} accessibilityRole="tab" accessibilityState={{ selected: round === item.roundNumber }} onPress={() => setRound(item.roundNumber)} style={styles.pill}><Text style={[styles.text, round === item.roundNumber && styles.selected]}>Round {item.roundNumber}</Text></Pressable>)}</ScrollView>
    {selected ? <View style={styles.summary}><Text style={styles.title}>{selected.courseName || "Course TBD"}</Text><Text style={styles.text}>{selected.playDate || "Date TBD"}</Text></View> : <Text style={styles.text}>No rounds planned yet.</Text>}
    {section === "Overview" ? state !== "ready" ? <StateSlot height={180} tone="dark" state={state === "loading" ? { kind: "loading" } : { kind: "error", message: "Couldn't load round scores.", onRetry: () => setRetry(value => value + 1) }} /> : scoring && pars.length === 18 ? <Leaderboard rows={preview.leaderboard.map(row => ({ name: row.golfer.name, strokes: row.holes }))} par={pars} range={[0, 18]} result={null} holeMoney={null} extraMoney={null} doubled={[]} /> : <StateSlot height={180} tone="dark" state={{ kind: "empty", message: scoring ? "Scores will show when the round's pars are confirmed." : "Round scores will show here when available." }} /> : <StateSlot height={180} tone="dark" state={{ kind: "empty", message: section === "Competition" ? "Your matchups will show here." : section === "Stats" ? "Stats will show here once players record rounds." : "Golf games are coming soon." }} />}
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: gutter, gap: 14, backgroundColor: colors.maroon900, flexGrow: 1 }, row: { gap: 8 }, pill: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderColor: colors.boardBorderSoft, borderWidth: 1, borderRadius: 20 }, text: { color: colors.onMaroon, fontFamily: fonts.regular, fontSize: 16 }, selected: { color: colors.goldBright, fontFamily: fonts.bold }, title: { color: colors.cream, fontFamily: fonts.bold, fontSize: 21 }, summary: { alignItems: "center", gap: 3, padding: 10 } });
