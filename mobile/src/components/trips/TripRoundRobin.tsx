import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { roundRobinSchedule, roundRobinStandings, type RoundRobinOutcome, type RoundRobinResults, type RoundRobinSide } from "@/lib/platform/roundRobin";
import { SheetClose } from "~/components/SheetClose.tsx";
import { apiRaw } from "~/lib/api.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/**
 * Round robin in the app (website TripRoundRobin, project_specs.md Golf Trips part 2e): the standings (W / L / T, winning
 * percentage, byes don't count) and every pairing by rotation. The organizer records each result; it's saved to the
 * trip's settings (`roundRobinResults`, the same field the website writes) by reading the latest settings and saving
 * them back with their revision, so a change made on another device is never overwritten. Everyone else reads.
 */
export function TripRoundRobin({ tripId, sides, roster, courses, initial, canEdit, onClose }: {
  tripId: string; sides: RoundRobinSide[]; roster: string; courses: string[]; initial: RoundRobinResults | undefined; canEdit: boolean; onClose: () => void;
}) {
  const [results, setResults] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const schedule = roundRobinSchedule(sides.map((s) => s.id));
  const outcomes = results?.roster === roster ? results.outcomes : {};
  const standings = roundRobinStandings(sides, schedule, outcomes);
  const names = new Map(sides.map((s) => [s.id, s.name]));

  const save = async (matchId: string, outcome: RoundRobinOutcome | null) => {
    setBusy(true); setMessage(null);
    const path = `/api/golf-trips/${encodeURIComponent(tripId)}/setup`;
    const latest = await apiRaw<{ values?: Record<string, unknown>; revision?: number; error?: string }>(path);
    if (latest.status !== 200 || !latest.body?.values || !Number.isInteger(latest.body.revision)) {
      setBusy(false); setMessage(latest.status === 0 ? "You're offline. Try again when you're back online." : latest.body?.error ?? "Couldn't load the trip's settings."); return;
    }
    const saved = latest.body.values.roundRobinResults as RoundRobinResults | undefined;
    const base = saved?.roster === roster ? { ...saved.outcomes } : {};
    if (outcome) base[matchId] = outcome; else delete base[matchId];
    const next: RoundRobinResults = { roster, outcomes: base };
    const reply = await apiRaw<{ ok?: boolean; error?: string }>(path, { method: "PUT", body: { values: { ...latest.body.values, roundRobinResults: next }, revision: latest.body.revision, writeId: Crypto.randomUUID() } });
    setBusy(false);
    if (reply.status === 200 && reply.body?.ok) { setResults(next); return; }
    setResults(saved);
    setMessage(reply.status === 409 ? "Settings changed on another device. Showing the latest — try again." : reply.status === 0 ? "You're offline. That result wasn't saved." : reply.body?.error ?? "Couldn't save that result.");
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.top}><Text style={styles.title}>Round Robin</Text><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 14 }}>
          <Text style={styles.note}>Every side plays every other side once. Byes do not count toward the record.</Text>
          <View accessibilityLabel="Round robin standings">
            <View style={styles.tr}>{["Side", "W", "L", "T", "PCT"].map((h, i) => <Text key={h} style={[i ? styles.td : styles.th, styles.head]}>{h}</Text>)}</View>
            {standings.map((row) => <View key={row.id} style={styles.tr}>
              <Text style={styles.th} numberOfLines={1}><Text style={styles.rank}>{row.rank} </Text>{row.name}</Text>
              {[row.wins, row.losses, row.ties].map((n, i) => <Text key={i} style={styles.td}>{n}</Text>)}
              <Text style={styles.td}>{row.played ? row.percentage.toFixed(3) : "—"}</Text>
            </View>)}
          </View>
          <Text style={styles.note}>Standings use winning percentage; a tie counts as half a win. Equal percentages share a rank.{canEdit ? " Tap a result to record it." : " The organizer records results."}</Text>
          {results && results.roster !== roster && <Text style={styles.note}>The lineup or round selection changed. Previous results do not apply to this schedule.</Text>}
          {message && <Text style={styles.error} accessibilityRole="alert">{message}</Text>}
          {schedule.map((rotation, index) => <View key={index} style={styles.rotation} accessibilityLabel={`Round robin rotation ${index + 1}`}>
            <Text style={styles.rotationTitle}>Rotation {index + 1}{courses[index] ? ` / ${courses[index]}` : ""}</Text>
            {rotation.matches.map((match) => {
              const home = names.get(match.home) ?? "", away = names.get(match.away) ?? "", now = outcomes[match.id];
              return <View key={match.id} style={styles.match}>
                <Text style={styles.matchName}>{home} <Text style={styles.vs}>vs</Text> {away}</Text>
                {canEdit ? <View style={styles.choices}>
                  {([["home", `${home} wins`], ["tie", "Tie"], ["away", `${away} wins`]] as const).map(([value, text]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: now === value, disabled: busy }} disabled={busy}
                    onPress={() => void save(match.id, now === value ? null : value)} style={[styles.choice, now === value && styles.choiceOn]}>
                    <Text style={[styles.choiceText, now === value && styles.choiceTextOn]} numberOfLines={1}>{text}</Text>
                  </Pressable>)}
                </View> : <Text style={styles.outcome}>{now === "tie" ? "Tied" : now ? `${now === "home" ? home : away} won` : "Not played"}</Text>}
              </View>;
            })}
            {rotation.bye && <Text style={styles.note}>Bye: {names.get(rotation.bye)}</Text>}
          </View>)}
          <Text style={styles.note}>{schedule.length} rotations needed. Rotations without a course can be scheduled in Golf Schedule.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.errorOnMaroon },
  tr: { flexDirection: "row", alignItems: "center", minHeight: 36, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  th: { flex: 3, fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  td: { flex: 1, textAlign: "center", fontFamily: fonts.regular, fontSize: 14, color: colors.cream, fontVariant: ["tabular-nums"] },
  head: { fontFamily: fonts.capsSemibold, fontSize: 11, color: colors.boardGold, textTransform: "uppercase" },
  rank: { fontFamily: fonts.bold, color: colors.boardGold },
  rotation: { gap: 8, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  rotationTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  match: { gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  matchName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  vs: { fontFamily: fonts.regular, color: colors.boardGold },
  choices: { flexDirection: "row", gap: 6 },
  choice: { flex: 1, minHeight: minTap - 8, paddingHorizontal: 6, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  choiceOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  choiceText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.cream },
  choiceTextOn: { color: colors.maroon900 },
  outcome: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
});
