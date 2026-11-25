import { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { AuthFrame, AuthMessage, AuthSmall } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { apiJson } from "~/lib/api.ts";
import { useAuth } from "~/lib/auth.tsx";
import { birthdayValue } from "~/lib/onboardingFlow.ts";
import { supabase } from "~/lib/supabase.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

const START = new Date(2000, 0, 1);
const EARLIEST = new Date(1900, 0, 1);

/**
 * What's your birthday? (website BirthdayScreen) → POST /api/account/birthday, saved once. 13+ → Photo (or straight to
 * Play for an older account that only needed its birthday). Under 13: the server closes the account and ends its
 * logins; this phone signs out too and Welcome says why.
 */
export default function Birthday() {
  const { refreshStep, setNotice } = useAuth();
  const [date, setDate] = useState(START);
  const [picked, setPicked] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date();

  async function save() {
    if (!picked || busy) return;
    setBusy(true); setError(null);
    const r = await apiJson<{ eligible?: boolean; signedOut?: boolean }>("/api/account/birthday", { method: "POST", body: { birthdate: birthdayValue(date) } });
    if (r.ok && r.body.eligible === true) {
      const step = await refreshStep();
      setBusy(false);
      if (step !== "play") router.replace("/onboarding/photo");
      return;
    }
    if (r.ok) {
      setNotice("ineligible");
      await supabase.auth.signOut({ scope: "local" });
      return;
    }
    setError(r.error); setBusy(false);
  }

  const pick = (_event: unknown, next?: Date) => { setAndroidOpen(false); if (next) { setDate(next); setPicked(true); } };
  return (
    <AuthFrame title="What's your birthday?" progress="birthday">
      {Platform.OS === "ios" ? (
        <View style={styles.wheel}>
          <DateTimePicker value={date} mode="date" display="spinner" onChange={pick} minimumDate={EARLIEST} maximumDate={today} themeVariant="dark" textColor={colors.cream} accessibilityLabel="Birthday" />
        </View>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Pick your birthday" onPress={() => setAndroidOpen(true)} style={styles.box}>
            <Text style={[styles.value, !picked && styles.placeholder]}>{picked ? date.toLocaleDateString() : "MM / DD / YYYY"}</Text>
          </Pressable>
          {androidOpen && <DateTimePicker value={date} mode="date" onChange={pick} minimumDate={EARLIEST} maximumDate={today} />}
        </>
      )}
      <AuthSmall>We require your date of birth to assist us in complying with privacy laws, as well as manage and personalize your account.</AuthSmall>
      <AuthMessage error={error} />
      <Button label={busy ? "Saving…" : "Continue"} onPress={() => void save()} disabled={!picked || busy} loading={busy} />
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  wheel: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill, overflow: "hidden" },
  box: { minHeight: 52, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.inputOnMaroon },
  value: { fontFamily: fonts.semibold, fontSize: 17, color: colors.cream },
  placeholder: { color: colors.wizardMuted },
});
