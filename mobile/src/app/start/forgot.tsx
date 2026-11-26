import { useState } from "react";
import { router } from "expo-router";
import { AuthField, AuthFrame, AuthMessage } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { authSend, errorOf } from "~/lib/authApi.ts";
import { isEmail } from "~/lib/onboardingFlow.ts";

/** Forgot password (website ForgotScreen): POST /api/auth/forgot-password (same answer with or without an account) → the code. */
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = isEmail(email) && !busy;

  async function sendCode() {
    if (!ready) return;
    setBusy(true); setError(null);
    const sent = await authSend("/api/auth/forgot-password", { email: email.trim(), next: "/start" });
    setBusy(false);
    if (sent.json.ok !== true) { setError(errorOf(sent)); return; }
    router.push({ pathname: "/start/verify", params: { email: email.trim(), kind: "recovery" } });
  }

  return (
    <AuthFrame title="Forgot password" back>
      <AuthField label="Email" value={email} onChangeText={setEmail} autoFocus autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" onSubmitEditing={() => void sendCode()} />
      <AuthMessage error={error} />
      <Button label={busy ? "Sending…" : "Send code"} onPress={() => void sendCode()} disabled={!ready} loading={busy} />
    </AuthFrame>
  );
}
