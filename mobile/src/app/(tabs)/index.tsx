import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActiveBoard } from "~/components/play/ActiveBoard.tsx";
import { BalataLogo } from "~/components/BalataLogo.tsx";
import { JoinCodeCard } from "~/components/play/JoinCodeCard.tsx";
import { ProfileSnapshot } from "~/components/play/ProfileSnapshot.tsx";
import { PlayMenu } from "~/components/play/PlayMenu.tsx";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";

/**
 * Play home (website PlatformHome, rebuilt natively — project_specs.md "Expo app Step 0 + Step 1", part 1a):
 * Balata + M, profile snapshot, your active board (round in progress / search for a course, round invites,
 * On The Range), Feed, and Join a Round.
 */
export default function PlayHome() {
  useLightStatusBar();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <Pressable accessibilityRole="button" accessibilityLabel={menuOpen ? "Close menu" : "Open menu"} accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(!menuOpen)} style={styles.menuButton}>
            <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLine} />
          </Pressable>
          <BalataLogo light style={styles.logo} />
        </View>
        <ProfileSnapshot />
        <ActiveBoard />
        <View style={styles.feed}><Text style={styles.feedTitle}>Feed</Text></View>
        <View style={styles.join}><JoinCodeCard /></View>
      </ScrollView>
      <PlayMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon950 },
  scroll: { backgroundColor: colors.maroon950 },
  content: { paddingBottom: 32 },
  brand: { flexDirection: "row", alignItems: "center", backgroundColor: colors.maroon950, paddingHorizontal: gutter, minHeight: 64 },
  menuButton: { width: 44, height: 44, justifyContent: "center", gap: 4 },
  menuLine: { width: 22, height: 2, backgroundColor: colors.cream, borderRadius: 1 },
  logo: { width: 150, height: 50, marginLeft: -18, transform: [{ translateY: 1 }] },
  feed: { paddingHorizontal: gutter, paddingVertical: 16 },
  feedTitle: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
  join: { paddingHorizontal: gutter, marginTop: 4 },
});
