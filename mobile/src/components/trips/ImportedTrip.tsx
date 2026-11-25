import { Pressable, StyleSheet, Text, View } from "react-native";
import { savedTripAsDraft } from "@/lib/platform/golfTripCreate";
import type { ImportedTripData } from "~/lib/tripPageRules.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";
import { TripGolf } from "./TripGolf.tsx";

/**
 * An imported past trip in the app (website ImportedGolfTripHome, project_specs.md Golf Trips part 2g slice 3): "Past trip",
 * the final team score and champion on top, then the same Golf tab a live trip has — leaderboard, matches, scorecards and
 * stats — read only. Nothing to score, plan or book: the trip is over. Results are worked out on the server.
 */
export function ImportedTrip({ data, onBack }: { data: ImportedTripData; onBack: () => void }) {
  const { savedTrip, view } = data;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.link}>‹ Golf Trips</Text></Pressable>
        <Text style={styles.badge}>Past trip</Text>
        <View style={styles.back} />
      </View>
      <Text style={styles.title} accessibilityRole="header">{savedTrip.trip.name}</Text>
      {view && (view.headline.team || view.headline.champion) && <View style={styles.result}>
        {view.headline.team && <Text style={styles.resultText}>👥 {view.headline.team}</Text>}
        {view.headline.champion && <Text style={styles.resultText}>🏆 Champion: {view.headline.champion}</Text>}
      </View>}
      {view ? <TripGolf match={view.previewMatch} schedule={{ ...savedTripAsDraft(savedTrip), ...view.roundFormats }}
        structure={{ individual: !!view.competitionType.individual, team: !!view.competitionType.team }} viewerName={null} roundLive={false}
        playerStats={false} predict={{ on: false, off: [] }} games={null} spectator tripStats={view.tripStats ?? undefined} />
        : <Text style={styles.muted}>This past trip's results couldn't be loaded. Pull down on Golf Trips and open it again.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, minHeight: 48 },
  back: { minWidth: 96, minHeight: minTap, justifyContent: "center" },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.boardLink },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.boardTop, fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  title: { paddingHorizontal: gutter, fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  result: { marginHorizontal: gutter, marginTop: 10, padding: 12, gap: 4, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorder, backgroundColor: colors.boardTop },
  resultText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  muted: { padding: gutter, fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk },
});
