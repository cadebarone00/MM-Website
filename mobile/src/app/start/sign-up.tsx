import { useState } from "react";
import { router } from "expo-router";
import { AuthField, AuthFrame, AuthMessage, AuthSmall } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { authSend, errorOf } from "~/lib/authApi.ts";
import { isEmail } from "~/lib/onboardingFlow.ts";

/**
 * Sign up (website SignUpScreen): email → the code is sent → Email Verification (the password comes after the code).
 * An email that already has an account stays here with the message, and Continue becomes Log in (email filled in).
 * Google / Apple aren't offered on Sign up during the beta (owner decision 2026-10-30), same as the website.
 */
export default function SignUp() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const ready = isEmail(email) && !busy;

  async function signUp() {
    setBusy(true); setError(null);
    const sent = await authSend("/api/auth/signup", { email: email.trim(), next: "/onboarding" });
    setBusy(false);
    if (sent.json.code === "account_exists") { setExists(true); setError(errorOf(sent)); return; }
    if (sent.json.ok !== true) { setError(errorOf(sent)); return; }
    router.push({ pathname: "/start/verify", params: { email: email.trim(), kind: "signup" } });
  }
  const logIn = () => router.replace({ pathname: "/start/log-in", params: { email: email.trim() } });

  return (
    <AuthFrame title="Sign up" progress="sign-up" back>
      <AuthField placeholder="Email" value={email} autoFocus keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
        onChangeText={(v) => { setEmail(v); setExists(false); setError(null); }} returnKeyType="next" onSubmitEditing={() => { if (exists) logIn(); else if (ready) void signUp(); }} />
      <AuthMessage error={error} />
      {exists ? <Button label="Log in" onPress={logIn} />
        : <Button label={busy ? "Sending code…" : "Continue"} onPress={() => void signUp()} disabled={!ready} loading={busy} />}
      <AuthSmall>By continuing, you agree to The Maroon&apos;s Terms of Service and Privacy Policy.</AuthSmall>
    </AuthFrame>
  );
}
