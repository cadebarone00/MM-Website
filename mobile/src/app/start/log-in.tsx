import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { AuthField, AuthFrame, AuthLink, AuthMessage } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { useAuth } from "~/lib/auth.tsx";
import { authSend, errorOf, keepLogin } from "~/lib/authApi.ts";

/**
 * Log in (website LogInScreen): email (or username) + password through POST /api/auth/login with client "app", so the
 * phone keeps the login. The app then opens Play, or the first unfinished sign-up step. Not verified yet → a fresh code
 * and the code screen. Google / Apple wait until they're switched on and checked for the app.
 */
export default function LogIn() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { notice, setNotice } = useAuth();
  const [email, setEmail] = useState(params.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Coming back from Set a new password (this screen may already be open underneath): show it once.
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (notice === "password-saved") { setSaved(true); setPassword(""); setNotice(null); } }, [notice, setNotice]);
  const ready = email.trim() !== "" && password !== "" && !busy;

  async function logIn() {
    if (!ready) return;
    setBusy(true); setError(null);
    const sent = await authSend("/api/auth/login", { usernameOrEmail: email.trim(), password, client: "app" });
    if (sent.json.unverified === true) {
      const address = typeof sent.json.email === "string" ? sent.json.email : email.includes("@") ? email.trim() : null;
      if (!address) { setError("Check your email to verify your account first. Log in with your email to get a new code."); setBusy(false); return; }
      await authSend("/api/auth/resend-verification", { email: address, next: "/onboarding" });
      setBusy(false);
      router.push({ pathname: "/start/verify", params: { email: address, kind: "signup" } });
      return;
    }
    if (sent.json.ok !== true) { setError(errorOf(sent, "That email and password don't match.")); setBusy(false); return; }
    if (!await keepLogin(sent)) { setError("We couldn't sign you in. Try again."); setBusy(false); }
  }

  return (
    <AuthFrame title="Log in" back={router.canGoBack()}>
      <AuthField placeholder="Email or username" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" returnKeyType="next" />
      <AuthField placeholder="Password" password value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="current-password" textContentType="password" onSubmitEditing={() => void logIn()} />
      <AuthMessage error={error} notice={saved ? "Password saved. Log in with your new password." : null} />
      <Button label={busy ? "Logging in…" : "Log in"} onPress={() => void logIn()} disabled={!ready} loading={busy} />
      <AuthLink label="Forgot password?" onPress={() => router.push("/start/forgot")} />
    </AuthFrame>
  );
}
