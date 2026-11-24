import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { apiJson } from "~/lib/api.ts";
import { readPhoneRound } from "~/lib/roundStore.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/**
 * Placeholder until Play part 3 (scoring + leaderboard) is rebuilt in the app. Shows which round you're in.
 * id = a round with friends (in the database), or "phone" = the round kept only on this phone.
 */
export default function RoundScreen() {
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (id === "phone") readPhoneRound().then((round) => { if (live) setCourse(round?.setup.course.name ?? null); });
    else apiJson<{ round?: { setup: { course: { name: string } } } }>(`/api/rounds/shared/${encodeURIComponent(id)}`).then((reply) => {
      if (live && reply.ok) setCourse(reply.body.round?.setup.course.name ?? null);
    });
    return () => { live = false; };
  }, [id]);

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title="Your round" back tone="dark" /></View>
      <View style={styles.gutter}>
        <Card tone="dark">
          <Text style={styles.title}>{course ? `You're in: ${course}` : "You're in this round"}</Text>
          <Text style={styles.body}>
            The live scorecard and leaderboard come to the new app in Play part 3. Until then, open this round in the current Maroon app
            {id === "phone" ? " (a round kept on this phone only stays on this phone)." : "."}
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon950 },
  gutter: { paddingHorizontal: gutter },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream, marginBottom: 6 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
});
