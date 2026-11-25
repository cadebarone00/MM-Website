import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** A Profile screen that's next in the rebuild (Profile part 3b–3d), so links never go nowhere. */
export function ProfileComing({ title, part }: { title: string; part: string }) {
  useLightStatusBar();
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title={title} back onBack={() => router.back()} tone="dark" /></View>
      <View style={styles.gutter}>
        <Card tone="dark"><Text style={styles.body}>{title} comes to the new app in Profile part {part}. Until then use the current Maroon app.</Text></Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
});
