import { useEffect, useState } from "react";
import { BalataLogo } from "~/components/BalataLogo.tsx";
import * as Haptics from "expo-haptics";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/Button.tsx";
import { useAuth } from "~/lib/auth.tsx";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/**
 * Profile Created! (website ProfileCreatedScreen): the M grows in while the phone buzzes, then the words and Let's go.
 * Let's go asks the server again: the account is Active, so the app opens Play. Claude's call: the M fades and grows in
 * instead of the website's hand-drawn line (the screenshot pass can match it).
 */
export default function Created() {
  useLightStatusBar();
  const { refreshStep } = useAuth();
  const [grow] = useState(() => new Animated.Value(0));
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const buzz = setInterval(() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, 300);
    Animated.timing(grow, { toValue: 1, duration: 2400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      clearInterval(buzz);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone(true);
    });
    return () => clearInterval(buzz);
  }, [grow]);

  async function go() {
    setBusy(true);
    await refreshStep(); // "play" → the tabs open by themselves
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <View style={styles.middle}>
        <Animated.View style={{ opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
          <BalataLogo light style={styles.logo} />
        </Animated.View>
        <View style={[styles.words, !done && styles.hidden]}>
          <Text accessibilityRole="header" style={styles.title}>Profile Created!</Text>
          <Text style={styles.subtitle}>Time to play some golf</Text>
        </View>
      </View>
      <View style={[styles.bottom, !done && styles.hidden]}>
        <Button label="Let's go" onPress={() => void go()} disabled={!done || busy} loading={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: gutter },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24 },
  logo: { width: 280, height: 94 },
  words: { alignItems: "center", gap: 6 },
  title: { fontFamily: fonts.bold, fontSize: 32, color: colors.cream },
  subtitle: { fontFamily: fonts.regular, fontSize: 17, color: colors.wizardMuted },
  bottom: { paddingBottom: 24 },
  hidden: { opacity: 0 },
});
