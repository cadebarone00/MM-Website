import { useState } from "react";
import { router } from "expo-router";
import { NAME_MAX, suggestUsername, usernameProblem } from "@/lib/profile/profileEdit";
import { AuthField, AuthFrame, AuthMessage } from "~/components/auth/AuthFrame.tsx";
import { Button } from "~/components/Button.tsx";
import { apiJson } from "~/lib/api.ts";

/** What's your name? (website NameScreen): first, last, username (fills itself from the name until edited) → POST /api/account/profile. */
export default function Name() {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [typedUsername, setTypedUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const username = typedUsername ?? suggestUsername(first, last);
  const problem = username ? usernameProblem(username) : null;
  const ready = first.trim() !== "" && username !== "" && !problem && !busy;

  async function save() {
    if (!ready) return;
    setBusy(true); setServerError(null);
    const r = await apiJson("/api/account/profile", { method: "POST", body: { displayName: `${first.trim()} ${last.trim()}`.trim(), username } });
    setBusy(false);
    if (!r.ok) { setServerError(r.error); return; }
    router.replace("/onboarding/birthday");
  }

  return (
    <AuthFrame title="What's your name?" progress="name">
      <AuthField label="First Name" value={first} onChangeText={setFirst} autoFocus maxLength={NAME_MAX} autoComplete="given-name" textContentType="givenName" />
      <AuthField label="Last Name" value={last} onChangeText={setLast} maxLength={NAME_MAX} autoComplete="family-name" textContentType="familyName" />
      <AuthField label="Username (@)" value={username} onChangeText={(v) => setTypedUsername(v.replace(/\s/g, ""))} maxLength={30} autoCapitalize="none" textContentType="username" onSubmitEditing={() => void save()} />
      <AuthMessage error={serverError ?? problem} />
      <Button label={busy ? "Saving…" : "Continue"} onPress={() => void save()} disabled={!ready} loading={busy} />
    </AuthFrame>
  );
}
