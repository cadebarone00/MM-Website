import { useCallback, useState } from "react";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { applyPreferenceChange, DISTANCE_UNITS, NOTIFICATION_TYPES, SCORE_ENTRIES, TEE_CHOICES, type PreferenceChange, type Preferences } from "@/lib/profile/preferences";
import { clearSeen, TOUR_SEEN_KEY } from "@/lib/platform/tripTour";
import { Button } from "~/components/Button.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { PillToggle } from "~/components/PillToggle.tsx";
import { SelectField } from "~/components/SelectField.tsx";
import { ChangePassword, Devices } from "~/components/settings/AccountParts.tsx";
import { PhoneNotifications } from "~/components/settings/PhoneNotifications.tsx";
import { SettingsError, SettingsNote, SettingsRow, SettingsSection, SettingsText } from "~/components/settings/SettingsParts.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiGet, apiJson, shareUrl } from "~/lib/api.ts";
import { useAuth } from "~/lib/auth.tsx";
import { answeredOffer, type OrganizerOffer } from "~/lib/settingsUi.ts";
import { turnOffPush } from "~/lib/push.ts";
import { supabase } from "~/lib/supabase.ts";
import { loadSeenStore, seenStore } from "~/lib/tripDraft.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, gutter } from "~/lib/theme.ts";

type SettingsData = { signedIn: boolean; email: string | null; preferences: Preferences | null; contentAdmin: boolean; offers: OrganizerOffer[] };
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: SettingsData };

const NO_TEES = "none";
/** Sign out: this phone stops getting that person's notifications first. */
const signOut = async () => { await turnOffPush(); await supabase.auth.signOut(); };
const openSite = (path: string) => { void Linking.openURL(shareUrl(path)); };

/**
 * Settings (website SettingsView; project_specs.md "Expo app Step 3", part 3d): Account, Notifications, Golf
 * preferences, Organizer, Tutorials, Help & legal, Sign out. Claude's call: Appearance (dark mode) waits for the look pass.
 */
export default function Settings() {
  useLightStatusBar();
  const { session } = useAuth();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);
  const [offers, setOffers] = useState<OrganizerOffer[]>([]);
  const [offerBusy, setOfferBusy] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSettings = useCallback(async () => {
    const r = await apiGet<SettingsData>("/api/app/profile?view=settings");
    if (!r.ok) { setLoad({ status: "error", message: r.error }); return; }
    setLoad({ status: "ok", data: r.data });
    setPrefs(r.data.preferences);
    setOffers(r.data.offers ?? []);
  }, []);
  useFocusEffect(useCallback(() => { void fetchSettings(); }, [fetchSettings]));
  const refresh = async () => { setRefreshing(true); await fetchSettings(); setRefreshing(false); };

  /** One change saves straight away; a failed save puts the old value back. */
  async function change(next: PreferenceChange) {
    if (!prefs) return;
    const before = prefs;
    setPrefs(applyPreferenceChange(prefs, next)); setPrefError(null);
    const r = await apiJson("/api/account/preferences", { method: "PUT", body: next });
    if (!r.ok) { setPrefs(before); setPrefError(r.error || "That didn't save. Try again."); }
  }

  async function answer(tripId: string, accept: boolean) {
    setOfferBusy(tripId); setOfferError(null);
    const r = await apiJson(`/api/golf-trips/${tripId}/organizer-handoff`, { method: "PATCH", body: { accept } });
    setOfferBusy(null);
    if (r.ok) setOffers((list) => list.map((o) => o.tripId === tripId ? answeredOffer(o, accept) : o));
    else setOfferError(r.error || "That didn't save. Try again.");
  }

  async function replayTour() {
    const account = session?.user.id ?? "";
    await loadSeenStore([TOUR_SEEN_KEY]);
    clearSeen(TOUR_SEEN_KEY, account, seenStore);
    router.push("/trips/new");
  }

  const header = <View style={styles.gutter}><PageHeader title="Settings" back onBack={() => router.back()} tone="dark" /></View>;
  if (load.status !== "ok") {
    return (
      <SafeAreaView style={styles.page} edges={["top"]}>
        {header}
        <View style={styles.gutter}>
          <StateSlot height={240} tone="dark" state={load.status === "loading" ? { kind: "loading" }
            : { kind: "error", message: load.message, onRetry: () => { setLoad({ status: "loading" }); void fetchSettings(); } }} />
          <Button label="Sign out" variant="secondaryOnDark" onPress={() => { void signOut(); }} />
        </View>
      </SafeAreaView>
    );
  }
  const { data } = load;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} />}>
        <SettingsSection title="Account">
          <SettingsRow label="Email" detail={data.email ?? "—"} />
          <ChangePassword />
          <Devices />
          <SettingsRow label="Delete account" danger last onPress={() => router.push("/settings/delete-account")} />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <PhoneNotifications />
          {!prefs ? <SettingsNote>Notification settings are coming soon.</SettingsNote> : NOTIFICATION_TYPES.map((type) => (
            <View key={type.id} style={styles.notification}>
              <SettingsText>{type.label}</SettingsText>
              <PillToggle tone="dark" label="Push" value={prefs.notifications[type.id].push} onChange={(on) => void change({ notification: type.id, channel: "push", on })} />
              <PillToggle tone="dark" label="Email" value={prefs.notifications[type.id].email} onChange={(on) => void change({ notification: type.id, channel: "email", on })} />
            </View>
          ))}
        </SettingsSection>

        <SettingsSection title="Golf preferences">
          {!prefs ? <SettingsNote>Golf preferences are coming soon.</SettingsNote> : (
            <>
              <SelectField tone="dark" label="Distance" value={prefs.distance} options={DISTANCE_UNITS.map((d) => ({ value: d.id, label: d.label }))}
                onChange={(distance) => void change({ distance })} />
              <SelectField tone="dark" label="Usual tees" value={prefs.usualTees || NO_TEES} placeholder="Not set"
                options={[{ value: NO_TEES, label: "Not set" }, ...TEE_CHOICES.map((t) => ({ value: t, label: t }))]}
                onChange={(t) => void change({ usualTees: t === NO_TEES ? "" : t as (typeof TEE_CHOICES)[number] })} />
              <SelectField tone="dark" label="Score entry" value={prefs.scoreEntry} options={SCORE_ENTRIES.map((s) => ({ value: s.id, label: s.label, detail: s.hint }))}
                onChange={(scoreEntry) => void change({ scoreEntry })} />
            </>
          )}
          {prefError && <SettingsError>{prefError}</SettingsError>}
        </SettingsSection>

        <SettingsSection title="Organizer">
          <SettingsNote>When you organize a tournament or trip, your organizer tools live here.</SettingsNote>
          {offers.length === 0 ? <SettingsRow label="Organizer offers" detail="No offers right now" last={!data.contentAdmin} /> : offers.map((offer) => (
            <View key={offer.tripId} style={styles.offer}>
              <SettingsText>{`${offer.fromName} asked you to take over ${offer.tripName} if they delete their account.`}</SettingsText>
              {offer.accepted && <SettingsNote>You accepted. You&apos;ll become the organizer if they delete their account.</SettingsNote>}
              {offer.declined && <SettingsNote>You declined.</SettingsNote>}
              {!offer.accepted && <Button label="Accept" onPress={() => void answer(offer.tripId, true)} disabled={offerBusy === offer.tripId} />}
              {!offer.declined && <Button label="Decline" variant="secondaryOnDark" onPress={() => void answer(offer.tripId, false)} disabled={offerBusy === offer.tripId} />}
            </View>
          ))}
          {offerError && <SettingsError>{offerError}</SettingsError>}
          {data.contentAdmin && <SettingsRow label="Content team" detail="On the website" last onPress={() => openSite("/settings/content-team")} />}
        </SettingsSection>

        <SettingsSection title="Tutorials">
          <SettingsRow label="Golf Trips" detail="Guided tour" last onPress={() => void replayTour()} />
        </SettingsSection>

        <SettingsSection title="Help & legal">
          <SettingsRow label="Contact us" onPress={() => openSite("/contact")} />
          <SettingsRow label="Terms of Service" detail="Coming soon" />
          <SettingsRow label="Privacy Policy" detail="Coming soon" />
          <SettingsRow label="App version" detail={Constants.expoConfig?.version ?? "—"} last />
        </SettingsSection>

        <Button label="Sign out" variant="secondaryOnDark" onPress={() => { void signOut(); }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  content: { gap: 22, paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 64 },
  notification: { gap: 2, paddingVertical: 4 },
  offer: { gap: 8, paddingVertical: 4 },
});
