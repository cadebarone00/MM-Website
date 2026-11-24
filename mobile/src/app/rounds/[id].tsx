import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";

/** Placeholder until Play part 3 (scoring + leaderboard) is rebuilt in the app. Rounds still work in the current app. */
export default function RoundScreen() {
  useLightStatusBar();
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title="Your round" back tone="dark" /></View>
      <View style={styles.gutter}>
        <Card tone="dark">
          <Text style={styles.title}>You&apos;re in this round</Text>
          <Text style={styles.body}>The live scorecard and leaderboard come to the new app in Play part 3. Until then, open this round in the current Maroon app.</Text>
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
