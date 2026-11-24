import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** A placeholder for a screen that's part of a later rebuild step ("Comes in part 2c"), so links never go nowhere. */
export function ComingInPart({ title, heading, part, note }: { title: string; heading: string; part: string; note: string }) {
  useLightStatusBar();
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title={title} back onBack={() => router.back()} tone="dark" /></View>
      <View style={styles.gutter}>
        <Card tone="dark">
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.body}>{note} This comes to the new app in Golf Trips part {part}; until then use the current Maroon app.</Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream, marginBottom: 6 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
});
