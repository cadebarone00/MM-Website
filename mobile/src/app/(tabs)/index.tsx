import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActiveBoard } from "~/components/play/ActiveBoard.tsx";
import { AppHeader } from "~/components/AppHeader.tsx";
import { JoinCodeCard } from "~/components/play/JoinCodeCard.tsx";
import { ProfileSnapshot } from "~/components/play/ProfileSnapshot.tsx";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";

/**
 * Play home (website PlatformHome, rebuilt natively — project_specs.md "Expo app Step 0 + Step 1", part 1a):
 * Balata + M, profile snapshot, your active board (round in progress / search for a course, round invites,
 * On The Range), Feed, and Join a Round.
 */
export default function PlayHome() {
  useLightStatusBar();
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <AppHeader />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ProfileSnapshot />
        <ActiveBoard />
        <View style={styles.feed}><Text style={styles.feedTitle}>Feed</Text></View>
        <View style={styles.join}><JoinCodeCard /></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.darkBackground },
  scroll: { backgroundColor: colors.darkBackground },
  content: { paddingBottom: 32 },
  feed: { paddingHorizontal: gutter, paddingVertical: 16 },
  feedTitle: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
  join: { paddingHorizontal: gutter, marginTop: 4 },
});
