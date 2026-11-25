import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/Button.tsx";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { supabase } from "~/lib/supabase.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** Settings (website SettingsView): Sign out now; the full Settings comes in Profile part 3d. */
export default function Settings() {
  useLightStatusBar();
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title="Settings" back onBack={() => router.back()} tone="dark" /></View>
      <View style={[styles.gutter, styles.body]}>
        <Card tone="dark"><Text style={styles.note}>Account, notifications, golf preferences and the rest come in Profile part 3d.</Text></Card>
        <Button label="Sign out" variant="secondaryOnDark" onPress={() => { void supabase.auth.signOut(); }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  body: { gap: 16 },
  note: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
});
