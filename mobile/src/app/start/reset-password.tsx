import { useState } from "react";
import { Redirect, router } from "expo-router";
import { AuthField, AuthFrame, AuthMessage } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { useAuth } from "~/lib/auth.tsx";
import { heldRecovery, holdRecovery, setNewPassword } from "~/lib/authApi.ts";
import { passwordCheck } from "~/lib/onboardingFlow.ts";

/** Set a new password (website PasswordScreen kind "reset"): only right after the reset code; then every device is signed out → Log in. */
export default function ResetPassword() {
  const { setNotice } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const check = passwordCheck(password, confirm);
  const session = heldRecovery();
  if (!session) return <Redirect href="/start/forgot" />;

  async function save() {
    if (!check.ready || busy || !session) return;
    setBusy(true); setServerError(null);
    const problem = await setNewPassword(session, password);
    setBusy(false);
    if (problem) { setServerError(problem); return; }
    holdRecovery(null);
    setNotice("password-saved");
    router.dismissTo("/start/log-in");
  }

  return (
    <AuthFrame title="Set a new password">
      <AuthField label="Password" password value={password} onChangeText={setPassword} autoFocus autoCapitalize="none" textContentType="newPassword" />
      <AuthField label="Confirm Password" password value={confirm} onChangeText={setConfirm} autoCapitalize="none" textContentType="newPassword" onSubmitEditing={() => void save()} />
      <AuthMessage error={serverError ?? check.problem} />
      <Button label={busy ? "Saving…" : "Save password"} onPress={() => void save()} disabled={!check.ready || busy} loading={busy} />
    </AuthFrame>
  );
}
