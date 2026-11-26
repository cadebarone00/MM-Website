import { useState } from "react";
import * as Linking from "expo-linking";
import { StyleSheet, View } from "react-native";
import { checkNewPassword, PASSWORD_HINT } from "@/lib/auth/passwordPolicy";
import { Button } from "~/components/Button.tsx";
import { apiJson, shareUrl } from "~/lib/api.ts";
import { NETWORK_ERROR } from "~/lib/apiReply.ts";
import { tokensFrom } from "~/lib/settingsUi.ts";
import { supabase } from "~/lib/supabase.ts";
import { PasswordBox, SettingsError, SettingsNote, SettingsRow, SettingsText } from "./SettingsParts.tsx";

/** The phone keeps working on the fresh login the server just made (every other device was signed out). */
async function keepThisPhoneSignedIn(body: unknown) {
  const tokens = tokensFrom(body);
  if (tokens) await supabase.auth.setSession(tokens).catch(() => undefined);
}

/** Settings → Account → Change password (website ChangePasswordSetting): current, new, new again. */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const rules = next ? checkNewPassword(next) : null;
  const ready = !!current && rules?.ok === true && again === next && !saving;

  async function save() {
    setSaving(true); setError(null);
    const r = await apiJson<{ session?: unknown }>("/api/account/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
    setSaving(false);
    if (!r.ok) {
      setError(r.error === NETWORK_ERROR
        ? "The connection dropped. Your password may already have changed: try your new password first; if it doesn't work, your old one still does."
        : r.error || "We couldn't change your password. Try again.");
      return;
    }
    await keepThisPhoneSignedIn(r.body);
    setDone(true); setOpen(false); setCurrent(""); setNext(""); setAgain("");
  }

  if (!open) {
    return (
      <>
        <SettingsRow label="Change password" onPress={() => { setOpen(true); setDone(false); }} />
        {done && <SettingsNote>Password changed. You&apos;ve been signed out on your other devices.</SettingsNote>}
      </>
    );
  }
  return (
    <View style={styles.form}>
      <PasswordBox label="Current password" value={current} onChange={setCurrent} disabled={saving} />
      <SettingsRow label="Forgot it? Get a reset email" onPress={() => void Linking.openURL(shareUrl("/forgot-password"))} />
      <PasswordBox label="New password" value={next} onChange={setNext} disabled={saving} newPassword />
      <SettingsNote>{rules && !rules.ok ? rules.error : PASSWORD_HINT}</SettingsNote>
      <PasswordBox label="New password again" value={again} onChange={setAgain} disabled={saving} newPassword />
      {again.length > 0 && again !== next && <SettingsNote>The new passwords don&apos;t match yet.</SettingsNote>}
      {error && <SettingsError>{error}</SettingsError>}
      <Button label={saving ? "Changing…" : "Change password"} onPress={() => void save()} disabled={!ready} loading={saving} />
      <Button label="Cancel" variant="secondaryOnDark" onPress={() => { setOpen(false); setError(null); }} disabled={saving} />
      <SettingsNote>Changing it signs you out on your other devices.</SettingsNote>
    </View>
  );
}

type Scope = "others" | "global";
const LABEL: Record<Scope, string> = { others: "Sign out of other devices", global: "Sign out everywhere" };
const EXPLAIN: Record<Scope, string> = {
  others: "Every other phone, tablet and browser is signed out. You stay signed in here.",
  global: "Every device is signed out, this one too. Use this if you think someone else has your account.",
};

/** Settings → Account → Devices (website DevicesSetting): both options need your password. */
export function Devices() {
  const [scope, setScope] = useState<Scope | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function confirm() {
    if (!scope) return;
    setBusy(true); setError(null);
    const r = await apiJson<{ session?: unknown; signedOut?: boolean }>("/api/account/sessions", { method: "POST", body: { scope, password } });
    setBusy(false);
    if (!r.ok) { setError(r.error || "We couldn't sign out your devices. Try again."); return; }
    // Everywhere = this phone too: the login is already gone on the server, so forget it here (back to Sign in).
    if (scope === "global") { await supabase.auth.signOut({ scope: "local" }).catch(() => undefined); return; }
    await keepThisPhoneSignedIn(r.body);
    setDone("Your other devices are signed out."); setScope(null); setPassword("");
  }

  if (!scope) {
    return (
      <>
        <SettingsRow label={LABEL.others} onPress={() => { setScope("others"); setDone(null); setError(null); }} />
        <SettingsRow label={LABEL.global} onPress={() => { setScope("global"); setDone(null); setError(null); }} />
        {done && <SettingsNote>{done}</SettingsNote>}
      </>
    );
  }
  return (
    <View style={styles.form}>
      <SettingsText>{EXPLAIN[scope]}</SettingsText>
      <PasswordBox label="Password" value={password} onChange={setPassword} disabled={busy} />
      {error && <SettingsError>{error}</SettingsError>}
      <Button label={busy ? "Signing out…" : LABEL[scope]} onPress={() => void confirm()} disabled={!password || busy} loading={busy} />
      <Button label="Cancel" variant="secondaryOnDark" onPress={() => { setScope(null); setPassword(""); setError(null); }} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: 10, paddingVertical: 6 } });
