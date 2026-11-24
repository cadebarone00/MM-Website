import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";

/** Placeholder until Play part 2 (start a round) is rebuilt in the app; it already receives the course you picked. */
export default function NewRound() {
  useLightStatusBar();
  const { name, place } = useLocalSearchParams<{ name?: string; place?: string }>();
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title="New round" back tone="dark" /></View>
      <View style={styles.gutter}>
        <Card tone="dark">
          <Text style={styles.caps}>COURSE</Text>
          <Text style={styles.title}>{name || "No course picked"}</Text>
          {place ? <Text style={styles.body}>{place}</Text> : null}
          <Text style={[styles.body, styles.gap]}>Setting up the round (tees, players, game) comes to the new app in Play part 2.</Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon950 },
  gutter: { paddingHorizontal: gutter },
  caps: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 1.4, color: colors.boardGold },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream, marginTop: 4 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
  gap: { marginTop: 12 },
});
