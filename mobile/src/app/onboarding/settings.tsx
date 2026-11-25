import { useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { finishProblem } from "@/lib/account/onboardingRoutes";
import { AuthFrame, AuthMessage, AuthSmall } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { PillToggle } from "~/components/PillToggle.tsx";
import { apiJson, apiRaw } from "~/lib/api.ts";
import { NETWORK_ERROR } from "~/lib/apiReply.ts";
import { useAuth } from "~/lib/auth.tsx";

/**
 * Last step! (website SettingsScreen) → Finish: saves Public / Private, records the Terms when they still need accepting,
 * then POST /api/account/finish. One Finish at a time. Profile Created only after the server says the account is Active;
 * any failure keeps the person here with the message, nothing saved is lost. Notifications: shown like the website,
 * nothing to save yet (the phone's own permission prompt comes with push notifications).
 */
export default function LastStep() {
  const { step } = useAuth();
  const needsTerms = step === "terms";
  const [publicProfile, setPublicProfile] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  async function finish() {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true); setError(null);
    const fail = (message: string) => { setError(message); setBusy(false); finishing.current = false; };
    const privacy = await apiJson("/api/account/privacy", { method: "PUT", body: { visibility: publicProfile ? "public" : "private" } });
    if (!privacy.ok) return fail(privacy.error);
    if (needsTerms) {
      const versions = await apiJson<{ terms?: unknown; privacy?: unknown }>("/api/account/terms");
      if (!versions.ok || typeof versions.body.terms !== "string" || typeof versions.body.privacy !== "string") return fail("Finishing sign-up isn't open yet. Your progress is saved.");
      const accepted = await apiJson("/api/account/terms", { method: "POST", body: { termsVersion: versions.body.terms, privacyVersion: versions.body.privacy } });
      if (!accepted.ok) return fail(accepted.error);
    }
    // apiRaw keeps the reply's `missing` list (which step still needs doing).
    const done = await apiRaw<{ ok?: boolean; activated?: boolean; code?: string; error?: string; missing?: string[] }>("/api/account/finish", { method: "POST" });
    if (done.status === 0) return fail(NETWORK_ERROR);
    if (done.body?.ok !== true || done.body.activated !== true) return fail(finishProblem(done.body?.code, done.body?.error, done.body?.missing));
    router.replace("/onboarding/created");
  }

  return (
    <AuthFrame title="Last step!" subtitle="Choose who can see your profile and how we keep you in the loop. You can change both later in Settings." progress="settings">
      <View style={styles.cards}>
        <PillToggle tone="dark" label="Public profile" value={publicProfile} onChange={setPublicProfile}
          note={publicProfile ? "Anyone on The Maroon can find you and see your profile and rounds." : "Off: your profile is private. Only people you play with can see it and your rounds."} />
        <PillToggle tone="dark" label="Notifications" value={notifications} onChange={setNotifications}
          note="We only notify you about your trips and rounds: tee times, live scores and results." />
      </View>
      <AuthSmall>{`We take your privacy seriously.${needsTerms ? "\nBy tapping Finish, you agree to the current Terms of Service and Privacy Policy." : ""}`}</AuthSmall>
      <AuthMessage error={error} />
      <Button label={busy ? "Finishing…" : "Finish"} onPress={() => void finish()} disabled={busy} loading={busy} />
    </AuthFrame>
  );
}

const styles = StyleSheet.create({ cards: { gap: 12 } });
