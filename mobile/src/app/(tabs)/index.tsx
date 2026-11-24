import { Image } from "expo-image";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActiveBoard } from "~/components/play/ActiveBoard.tsx";
import { JoinCodeCard } from "~/components/play/JoinCodeCard.tsx";
import { ProfileSnapshot } from "~/components/play/ProfileSnapshot.tsx";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import logo from "../../../assets/brand/maroon-m-white.svg";

/**
 * Play home (website PlatformHome, rebuilt natively — project_specs.md "Expo app Step 0 + Step 1", part 1a):
 * The Maroon + M, profile snapshot, your active board (round in progress / search for a course, round invites,
 * On The Range), Feed, and Join a Round.
 */
export default function PlayHome() {
  useLightStatusBar();
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <Text style={styles.brandTitle} accessibilityRole="header">The Maroon</Text>
          <Image source={logo} style={styles.logo} contentFit="contain" accessible={false} />
        </View>
        <ProfileSnapshot />
        <ActiveBoard />
        <View style={styles.feed}><Text style={styles.feedTitle}>Feed</Text></View>
        <View style={styles.join}><JoinCodeCard /></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon950 },
  content: { paddingTop: 4, paddingBottom: 32 },
  brand: { alignItems: "center", paddingTop: 12, paddingBottom: 8, paddingHorizontal: 20 },
  brandTitle: { marginBottom: 8, fontFamily: fonts.regular, fontSize: 34, letterSpacing: -1, color: colors.cream },
  logo: { width: 36, height: 36 },
  feed: { paddingHorizontal: gutter, paddingVertical: 16 },
  feedTitle: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
  join: { paddingHorizontal: gutter, marginTop: 4 },
});
