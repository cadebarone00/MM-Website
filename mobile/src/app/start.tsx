import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/Button.tsx";
import { useAuth } from "~/lib/auth.tsx";
import { statusWords } from "~/lib/onboardingFlow.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import logo from "../../assets/brand/maroon-m-white.svg";

/** Welcome (website WelcomeScreen): the M, Sign up, Log in. After an under-13 birthday it says why the account stopped. */
export default function Welcome() {
  useLightStatusBar();
  const { notice } = useAuth();
  const ineligible = notice === "ineligible" ? statusWords("ineligible") : null;
  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <View style={styles.mark}><Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="The Maroon" /></View>
      {ineligible && (
        <View style={styles.notice} accessibilityRole="alert">
          <Text style={styles.noticeTitle}>{ineligible.title}</Text>
          <Text style={styles.noticeBody}>{ineligible.body}</Text>
        </View>
      )}
      <View style={styles.buttons}>
        <Button label="Sign up" onPress={() => router.push("/start/sign-up")} />
        <Button label="Log in" variant="secondaryOnDark" onPress={() => router.push("/start/log-in")} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: gutter },
  mark: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 120, height: 120 },
  notice: { gap: 4, marginBottom: 20 },
  noticeTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream, textAlign: "center" },
  noticeBody: { fontFamily: fonts.regular, fontSize: 15, color: colors.wizardMuted, textAlign: "center" },
  buttons: { gap: 12, paddingBottom: 24 },
});
