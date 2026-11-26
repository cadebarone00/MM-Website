import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/Button.tsx";
import { useAuth } from "~/lib/auth.tsx";
import { screenForStep, statusWords } from "~/lib/onboardingFlow.ts";
import { supabase } from "~/lib/supabase.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/**
 * Account status (website AccountStatusView) for a signed-in account that can't go on: under 13, being reviewed, closed,
 * or the check itself failed (Try again). Never Play. Sign out to use another account.
 */
export default function Status() {
  useLightStatusBar();
  const { step, refreshStep } = useAuth();
  const [busy, setBusy] = useState(false);
  const words = statusWords(step ?? "error");

  async function retry() {
    setBusy(true);
    const next = screenForStep(await refreshStep());
    setBusy(false);
    if (next !== "play" && next !== "/onboarding/status") router.replace(next);
  }

  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <View style={styles.middle}>
        <Text accessibilityRole="header" style={styles.title}>{words.title}</Text>
        <Text style={styles.body}>{words.body}</Text>
        {(step === "restricted" || step === "ineligible") && <Text style={styles.body}>Questions? Email themaroonadmin@gmail.com</Text>}
      </View>
      <View style={styles.buttons}>
        {(step === "error" || step === null) && <Button label="Try again" onPress={() => void retry()} loading={busy} disabled={busy} />}
        <Button label="Sign out" variant="secondaryOnDark" onPress={() => { void supabase.auth.signOut({ scope: "local" }); }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: gutter },
  middle: { flex: 1, justifyContent: "center", gap: 10 },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.cream, textAlign: "center" },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.wizardMuted, textAlign: "center" },
  buttons: { gap: 12, paddingBottom: 24 },
});
