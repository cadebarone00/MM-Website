import React, { useRef, useState } from "react";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthFrame, AuthLink, AuthMessage, AuthSmall } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { authSend, errorOf, holdRecovery, keepLogin } from "~/lib/authApi.ts";
import { CODE_LENGTH, cleanCode } from "~/lib/onboardingFlow.ts";
import { tokensFrom } from "~/lib/settingsUi.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

/**
 * Email Verification (sign-up) and Enter Code To Reset (forgot password) — website CodeScreen, POST /api/auth/verify-code
 * with client "app" so the login comes back to the phone. Sign-up: the phone keeps it and the app moves on to Create a
 * password by itself. Reset: the login is only held for the next screen (Set a new password), never kept.
 */
export default function Verify() {
  const { email = "", kind = "signup" } = useLocalSearchParams<{ email?: string; kind?: "signup" | "recovery" }>();
  const signup = kind !== "recovery";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const complete = code.length === CODE_LENGTH && !!email && !busy;

  async function verify(typed = code) {
    if (typed.length !== CODE_LENGTH || busy) return;
    setBusy(true); setError(null);
    const sent = await authSend("/api/auth/verify-code", { email, code: typed, type: signup ? "signup" : "recovery", client: "app" });
    if (sent.json.ok !== true) { setError(errorOf(sent)); setCode(""); setBusy(false); return; }
    if (!signup) {
      holdRecovery(tokensFrom(sent.json));
      setBusy(false);
      router.replace("/start/reset-password");
      return;
    }
    // The app switches to onboarding as soon as the login is kept; nothing else to do here.
    if (!await keepLogin(sent)) { setError("We couldn't sign you in. Try again."); setBusy(false); }
  }

  async function resend() {
    setError(null);
    const sent = signup
      ? await authSend("/api/auth/resend-verification", { email, next: "/onboarding" })
      : await authSend("/api/auth/forgot-password", { email, next: "/start" });
    if (sent.status === 0) { setError(errorOf(sent)); return; }
    setCode(""); setResent(true);
  }

  return (
    <AuthFrame title={signup ? "Email Verification" : "Enter Code To Reset"} subtitle={email ? `We sent a 6-digit code to ${email}.` : undefined}
      progress={signup ? "verify" : undefined} back>
      <Pressable accessibilityLabel="6-digit code" onPress={() => input.current?.focus()} style={styles.boxes}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <View key={i} style={[styles.box, i === Math.min(code.length, CODE_LENGTH - 1) && styles.current]}>
            <Text style={styles.digit}>{code[i] ?? ""}</Text>
          </View>
        ))}
        <TextInput ref={input} value={code} autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={CODE_LENGTH}
          onChangeText={(v) => { const next = cleanCode(v); setCode(next); if (next.length === CODE_LENGTH) void verify(next); }} style={styles.hidden} caretHidden />
      </Pressable>
      <AuthMessage error={error} notice={resent ? "New code sent." : null} />
      <Button label={busy ? "Checking…" : "Verify"} onPress={() => void verify()} disabled={!complete} loading={busy} />
      <AuthLink label={resent ? "New code sent" : "Resend code"} onPress={() => void resend()} />
      <AuthSmall>Experiencing issues? Email our team:</AuthSmall>
      <AuthLink label="themaroonadmin@gmail.com" onPress={() => void Linking.openURL("mailto:themaroonadmin@gmail.com")} />
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  box: { flex: 1, aspectRatio: 0.82, maxHeight: 64, alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.inputOnMaroon },
  current: { borderColor: colors.goldBright, borderWidth: 2 },
  digit: { fontFamily: fonts.bold, fontSize: 26, color: colors.cream },
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },
});
