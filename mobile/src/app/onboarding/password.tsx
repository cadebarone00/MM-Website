import { useState } from "react";
import { router } from "expo-router";
import { AuthField, AuthFrame, AuthMessage } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { apiJson } from "~/lib/api.ts";
import { useAuth } from "~/lib/auth.tsx";
import { passwordCheck, screenForStep } from "~/lib/onboardingFlow.ts";
import { supabase } from "~/lib/supabase.ts";

/** The Terms / Privacy versions agreed on Sign up, recorded once the email is verified (website CodeScreen). Not fatal:
 *  the Last step asks again before Finish when they're still missing. */
async function recordTerms() {
  const versions = await apiJson<{ terms?: unknown; privacy?: unknown }>("/api/account/terms");
  if (versions.ok && typeof versions.body.terms === "string" && typeof versions.body.privacy === "string") {
    await apiJson("/api/account/terms", { method: "POST", body: { termsVersion: versions.body.terms, privacyVersion: versions.body.privacy } });
  }
}

/** Create a password (website PasswordScreen kind "create"), right after the email code → POST /api/auth/create-password. */
export default function CreatePassword() {
  const { refreshStep, session, setNotice } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const check = passwordCheck(password, confirm);

  async function save() {
    if (!check.ready || busy) return;
    setBusy(true); setServerError(null);
    const r = await apiJson("/api/auth/create-password", { method: "POST", body: { password } });
    if (!r.ok && r.code === "signed_out") { await supabase.auth.signOut({ scope: "local" }); return; }
    // Already set (e.g. saved on another device): carry on anyway.
    if (!r.ok && r.code !== "already_set") { setServerError(r.error); setBusy(false); return; }
    if (r.ok) {
      // Saving the password on the server ends every login, this phone's too (found 2026-11-25: the next step check
      // failed with "We couldn't check your account"). Log straight back in with the password just chosen.
      const email = session?.user.email ?? "";
      const again = email ? await supabase.auth.signInWithPassword({ email, password }).catch(() => null) : null;
      if (!again || again.error) {
        setNotice("password-saved");
        await supabase.auth.signOut({ scope: "local" });
        return;
      }
    }
    await recordTerms();
    const next = screenForStep(await refreshStep());
    setBusy(false);
    if (next !== "play") router.replace(next === "/onboarding/password" ? "/onboarding/name" : next);
  }

  return (
    <AuthFrame title="Create a password" progress="password">
      <AuthField label="Password" password value={password} onChangeText={setPassword} autoFocus autoCapitalize="none" textContentType="newPassword" />
      <AuthField label="Confirm Password" password value={confirm} onChangeText={setConfirm} autoCapitalize="none" textContentType="newPassword" onSubmitEditing={() => void save()} />
      <AuthMessage error={serverError ?? check.problem} />
      <Button label={busy ? "Saving…" : "Continue"} onPress={() => void save()} disabled={!check.ready || busy} loading={busy} />
    </AuthFrame>
  );
}
