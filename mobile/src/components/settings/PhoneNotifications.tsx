import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { apiJson } from "~/lib/api.ts";
import { pushState, turnOffPush, turnOnPush, type PushState } from "~/lib/push.ts";
import { SettingsError, SettingsNote, SettingsRow } from "./SettingsParts.tsx";

const DETAIL: Record<PushState, string> = {
  on: "On", off: "Off", denied: "Off in iPhone Settings", unsupported: "Not on this device", not_set_up: "Coming soon",
};

/**
 * Settings → Notifications → Phone notifications (project_specs.md "Expo app Step 6"): whether this phone gets them,
 * Turn on / off (the phone's own prompt the first time; "Off in iPhone Settings" opens the phone's settings), and Send
 * a test notification. The Push / Email switches below choose WHICH notifications come.
 */
export function PhoneNotifications() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => setState(await pushState().catch(() => "off" as const)), []);
  useEffect(() => {
    void refresh();
    // Coming back from iPhone Settings (where notifications get allowed): check again.
    const sub = AppState.addEventListener("change", (next) => { if (next === "active") void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  async function toggle() {
    if (!state || busy) return;
    setBusy(true); setError(null); setNote(null);
    if (state === "denied") { void Linking.openSettings(); setBusy(false); return; }
    if (state === "on") { await turnOffPush(); setState("off"); setBusy(false); return; }
    const answer = await turnOnPush(true);
    setState(answer.state);
    if (answer.message) setError(answer.message);
    setBusy(false);
  }
  async function test() {
    setBusy(true); setError(null); setNote(null);
    const r = await apiJson("/api/app/push-test", { method: "POST" });
    setBusy(false);
    if (r.ok) setNote("Sent. It should show up in a few seconds.");
    else setError(r.error);
  }

  const canChange = state === "on" || state === "off" || state === "denied";
  return (
    <>
      <SettingsRow label="Phone notifications" detail={state ? DETAIL[state] : "…"} onPress={canChange && !busy ? () => void toggle() : undefined} />
      {state === "off" && <SettingsNote>Tap to turn them on for this phone.</SettingsNote>}
      {state === "on" && <SettingsRow label="Send a test notification" onPress={busy ? undefined : () => void test()} />}
      {note && <SettingsNote>{note}</SettingsNote>}
      {error && <SettingsError>{error}</SettingsError>}
    </>
  );
}
