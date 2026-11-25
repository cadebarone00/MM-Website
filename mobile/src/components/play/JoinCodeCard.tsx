import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { JOIN_CODE_HINT, shownJoinCode, typedJoinCode } from "~/lib/play.ts";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

const TITLE = { round: "Join a Round", trip: "Join a Trip", league: "Join a League" } as const;
const SCREEN = { round: "/rounds/join", trip: "/trips/join", league: "/leagues/join" } as const;

/** The "Join a Round" / "Join a Trip" card (website JoinCodeCard): a 6-character code, any case, dash optional → that kind's Join screen. */
export function JoinCodeCard({ kind = "round", onJoin }: { kind?: "round" | "trip" | "league"; onJoin?: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function join() {
    if (code.length !== 6) { setError(JOIN_CODE_HINT); return; }
    onJoin?.();
    router.push({ pathname: SCREEN[kind], params: { code } });
    setCode("");
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{TITLE[kind]}</Text>
      <Text style={styles.hint}>Enter the code you were sent.</Text>
      <View style={styles.row}>
        <TextInput
          value={shownJoinCode(code)}
          onChangeText={(text) => { setCode(typedJoinCode(text)); setError(null); }}
          placeholder="Join code"
          placeholderTextColor={colors.searchFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={7}
          returnKeyType="go"
          onSubmitEditing={join}
          accessibilityLabel="Join code"
          style={styles.input}
        />
        <Pressable accessibilityRole="button" disabled={!code} onPress={join} style={[styles.button, !code && styles.disabled]}>
          <Text style={styles.buttonText}>Join</Text>
        </Pressable>
      </View>
      {/* Fixed-height line for the error so the card doesn't grow. */}
      <Text style={styles.error} accessibilityLiveRegion="polite">{error ?? " "}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, borderColor: colors.boardBorderSoft, borderRadius: 16, backgroundColor: colors.inviteFill, gap: 6 },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  hint: { fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk },
  row: { flexDirection: "row", gap: 8, marginTop: 6 },
  input: { flex: 1, minHeight: minTap + 4, paddingHorizontal: 14, borderRadius: radius.control, backgroundColor: colors.searchField, color: colors.cream, fontFamily: fonts.semibold, fontSize: 18, letterSpacing: 2 },
  button: { minHeight: minTap + 4, paddingHorizontal: 22, borderRadius: radius.control, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.5 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon900 },
  error: { height: 20, fontFamily: fonts.regular, fontSize: 13, color: colors.errorOnMaroon },
});
