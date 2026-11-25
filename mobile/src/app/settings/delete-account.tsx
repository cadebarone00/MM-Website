import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deletionSummary, resultMessage, tripOutcomeText, type DeletionCounts, type DeletionState, type HandoffState, type TripOutcome } from "@/lib/account/deletionCopy";
import { Button } from "~/components/Button.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { SelectField } from "~/components/SelectField.tsx";
import { PasswordBox, SettingsError, SettingsNote, SettingsSection, SettingsText } from "~/components/settings/SettingsParts.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiGet, apiJson } from "~/lib/api.ts";
import { canConfirmDelete, tripDay } from "~/lib/settingsUi.ts";
import { supabase } from "~/lib/supabase.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type DeletionTrip = {
  tripId: string; name: string; startDate: string; endDate: string; ended: boolean; outcome: TripOutcome;
  handoff: { toName: string; state: HandoffState } | null; eligible: { memberId: string; name: string }[];
};
type Preview = { trips: DeletionTrip[]; counts: DeletionCounts };
type Reply = { status: "signed-out" } | { status: "ok"; preview: Preview | null };
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; preview: Preview };

/**
 * Settings → Delete account (website DeleteAccountFlow; part 3d): what gets deleted / kept, each trip you organize
 * (ask a member to take over; they must accept), then password + DELETE. Says "closed" until the server confirms every
 * step; only "completed" says deleted. Then this phone signs out.
 */
export default function DeleteAccount() {
  useLightStatusBar();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [tripError, setTripError] = useState<Record<string, string>>({});
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeletionState | null>(null);

  const fetchPreview = useCallback(async () => {
    const r = await apiGet<Reply>("/api/app/profile?view=delete");
    if (!r.ok) { setLoad({ status: "error", message: r.error }); return; }
    if (r.data.status !== "ok") { setLoad({ status: "error", message: "You're signed out. Sign in again." }); return; }
    if (!r.data.preview) { setLoad({ status: "error", message: "Deleting an account isn't available yet. Try again later." }); return; }
    setLoad({ status: "ok", preview: r.data.preview });
  }, []);
  useEffect(() => { void fetchPreview(); }, [fetchPreview]);

  async function tripAction(tripId: string, run: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyTrip(tripId); setTripError((e) => ({ ...e, [tripId]: "" }));
    const r = await run();
    if (!r.ok) setTripError((e) => ({ ...e, [tripId]: r.error || "That didn't save. Try again." }));
    else await fetchPreview();
    setBusyTrip(null);
  }
  const ask = (tripId: string, memberId: string) => tripAction(tripId, () => apiJson(`/api/golf-trips/${tripId}/organizer-handoff`, { method: "POST", body: { memberId } }));
  const withdraw = (tripId: string) => tripAction(tripId, () => apiJson(`/api/golf-trips/${tripId}/organizer-handoff`, { method: "DELETE" }));

  async function confirmDelete() {
    setBusy(true); setError(null);
    const r = await apiJson<{ state?: DeletionState }>("/api/account/delete", { method: "POST", body: { confirm: "DELETE", password } });
    setBusy(false);
    if (r.ok && r.body.state) { setResult(r.body.state); return; }
    setError(r.ok ? "We couldn't delete your account. Try again." : r.error || "We couldn't delete your account. Try again.");
  }

  const header = <View style={styles.gutter}><PageHeader title="Delete account" back={!result} onBack={() => router.back()} tone="dark" /></View>;

  if (result) {
    const message = resultMessage(result);
    return (
      <SafeAreaView style={styles.page} edges={["top"]}>
        {header}
        <View style={[styles.gutter, styles.done]}>
          <Text style={styles.pill}>{message.done ? "Deletion completed" : "Account closed · deletion finishing"}</Text>
          <Text style={styles.doneTitle}>{message.title}</Text>
          <SettingsText>{message.body}</SettingsText>
          {/* The login is gone on the server: forget it on this phone too (back to Sign in). */}
          <Button label="Done" onPress={() => { void supabase.auth.signOut({ scope: "local" }); }} />
        </View>
      </SafeAreaView>
    );
  }

  if (load.status !== "ok") {
    return (
      <SafeAreaView style={styles.page} edges={["top"]}>
        {header}
        <View style={styles.gutter}>
          <StateSlot height={240} tone="dark" state={load.status === "loading" ? { kind: "loading" }
            : { kind: "error", message: load.message, onRetry: () => { setLoad({ status: "loading" }); void fetchPreview(); } }} />
        </View>
      </SafeAreaView>
    );
  }

  const { preview } = load;
  const summary = deletionSummary(preview.counts);
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SettingsSection title="What happens">
          <SettingsText>Deleting your account is permanent. It can&apos;t be undone, and signing up again later starts a brand-new account.</SettingsText>
          <Text style={styles.subhead}>Deleted</Text>
          {summary.deleted.map((line) => <Text key={line} style={styles.bullet}>{`•  ${line}`}</Text>)}
          {summary.kept.length > 0 && (
            <>
              <Text style={styles.subhead}>Kept, without your name</Text>
              {summary.kept.map((line) => <Text key={line} style={styles.bullet}>{`•  ${line}`}</Text>)}
            </>
          )}
        </SettingsSection>

        {preview.trips.length > 0 && (
          <SettingsSection title="Trips you organize">
            {preview.trips.map((trip) => {
              const canAsk = !trip.ended && trip.outcome !== "transfer";
              return (
                <View key={trip.tripId} style={styles.trip}>
                  <Text style={styles.tripName}>{trip.name}<Text style={styles.tripDates}>{`  ·  ${tripDay(trip.startDate)} – ${tripDay(trip.endDate)}`}</Text></Text>
                  <SettingsNote>{tripOutcomeText(trip)}</SettingsNote>
                  {canAsk && (trip.eligible.length > 0 ? (
                    <>
                      <SelectField tone="dark" label="Ask someone to take over" value={choice[trip.tripId] ?? null} placeholder="Choose a member"
                        options={trip.eligible.map((m) => ({ value: m.memberId, label: m.name }))} onChange={(id) => setChoice((c) => ({ ...c, [trip.tripId]: id }))} />
                      <Button label="Ask" variant="secondaryOnDark" disabled={!choice[trip.tripId] || busyTrip === trip.tripId} onPress={() => void ask(trip.tripId, choice[trip.tripId])} />
                    </>
                  ) : <SettingsNote>Nobody on this trip can take over yet: members need to have joined and finished their profile.</SettingsNote>)}
                  {trip.handoff?.state === "pending" && <Button label="Withdraw request" variant="secondaryOnDark" disabled={busyTrip === trip.tripId} onPress={() => void withdraw(trip.tripId)} />}
                  {tripError[trip.tripId] ? <SettingsError>{tripError[trip.tripId]}</SettingsError> : null}
                </View>
              );
            })}
          </SettingsSection>
        )}

        <SettingsSection title="Delete account">
          <SettingsText>To confirm it&apos;s you, enter your password and type DELETE.</SettingsText>
          <PasswordBox label="Password" value={password} onChange={setPassword} disabled={busy} />
          <PasswordBox label="Type DELETE" value={typed} onChange={setTyped} disabled={busy} caps />
          {error && <SettingsError>{error}</SettingsError>}
          <Button label={busy ? "Deleting your account… keep this open" : "Delete my account"} variant="danger" loading={busy}
            disabled={!canConfirmDelete(password, typed, busy)} onPress={() => void confirmDelete()} />
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  content: { gap: 22, paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 64 },
  subhead: { marginTop: 6, fontFamily: fonts.bold, fontSize: 15, color: colors.goldBright },
  bullet: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.cream },
  trip: { gap: 8, paddingVertical: 6 },
  tripName: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  tripDates: { fontFamily: fonts.regular, fontSize: 13, color: colors.wizardMuted },
  done: { gap: 14, paddingTop: 24 },
  pill: { alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, overflow: "hidden", backgroundColor: colors.wizardFill, fontFamily: fonts.capsSemibold, fontSize: 12, letterSpacing: 1, color: colors.goldBright },
  doneTitle: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
});
