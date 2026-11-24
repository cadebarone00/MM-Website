import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tripDateRange } from "@/lib/platform/golfTripCreate";
import { isInviteToken, type InvitationPreview } from "@/lib/platform/golfTripInvitations";
import { Button } from "~/components/Button.tsx";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { apiJson } from "~/lib/api.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Look = { status: "loading" } | { status: "ready"; invitation: InvitationPreview | null } | { status: "declined" };

/**
 * Accept or decline a trip invitation (website GolfTripInviteResponse; GET /api/golf-trips/invitations/<token>,
 * POST …/<token> to accept, …/<token>/decline). The app is always signed in.
 */
export default function TripInvite() {
  useLightStatusBar();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const valid = isInviteToken(token);
  const [look, setLook] = useState<Look>(valid ? { status: "loading" } : { status: "ready", invitation: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!valid) return;
    let live = true;
    apiJson<{ invitation?: InvitationPreview }>(`/api/golf-trips/invitations/${encodeURIComponent(token!)}`).then((reply) => {
      if (live) setLook({ status: "ready", invitation: reply.ok ? reply.body.invitation ?? null : null });
    });
    return () => { live = false; };
  }, [valid, token]);

  async function respond(action: "accept" | "decline") {
    setBusy(true);
    setError(null);
    const reply = await apiJson<{ tripId?: string }>(`/api/golf-trips/invitations/${encodeURIComponent(token!)}${action === "decline" ? "/decline" : ""}`, { method: "POST" });
    setBusy(false);
    if (!reply.ok) { setError(reply.error); return; }
    if (action === "decline") { setLook({ status: "declined" }); return; }
    if (reply.body.tripId) router.replace({ pathname: "/trips/[id]", params: { id: reply.body.tripId } });
  }
  const confirmDecline = () => Alert.alert("Decline this invitation?", "The link will stop working.", [
    { text: "Back", style: "cancel" },
    { text: "Decline", style: "destructive", onPress: () => void respond("decline") },
  ]);

  const invitation = look.status === "ready" ? look.invitation : null;
  const dates = invitation?.startDate && invitation.endDate ? tripDateRange(invitation.startDate, invitation.endDate) : null;
  const goToTrips = <Button label="Go to Golf Trips" variant="secondaryOnDark" onPress={() => router.navigate("/golf-trips")} style={styles.gap} />;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title="Trip invitation" back tone="dark" /></View>
      <View style={styles.body}>
        {invitation && (
          <View style={styles.header}>
            <Text style={styles.eyebrow}>GOLF TRIP INVITATION</Text>
            <Text style={styles.tripName}>{invitation.tripName}</Text>
            <Text style={styles.details}>{[dates, invitation.destination].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.details}>{invitation.organizerName ? `${invitation.organizerName} invited ${invitation.invitedName}.` : `Invitation for ${invitation.invitedName}.`}</Text>
          </View>
        )}
        <Card tone="dark">
          {look.status === "loading" ? <ActivityIndicator color={colors.goldBright} />
            : look.status === "declined" ? (
              <><Text style={styles.cardTitle}>Invitation declined</Text><Text style={styles.note}>You said no to this trip. If you change your mind, ask the organizer for a new invite.</Text>{goToTrips}</>
            ) : !invitation ? (
              <><Text style={styles.cardTitle}>This invitation isn&apos;t valid anymore</Text><Text style={styles.note}>It may have been cancelled, replaced by a newer link, or already answered. Ask the trip organizer to send you a new invite.</Text>{goToTrips}</>
            ) : invitation.status === "claimed" ? (
              <><Text style={styles.cardTitle}>Invitation already used</Text><Text style={styles.note}>Someone already used this invite. If it was meant for you, ask the organizer for a new one.</Text>{goToTrips}</>
            ) : invitation.status === "yours" || invitation.status === "already_member" ? (
              <><Text style={styles.cardTitle}>You&apos;re in this trip</Text><Button label="Open trip" onPress={() => router.replace({ pathname: "/trips/[id]", params: { id: invitation.tripId, name: invitation.tripName } })} style={styles.gap} /></>
            ) : (
              <>
                <Text style={styles.cardTitle}>Join this trip?</Text>
                <Button label={busy ? "Joining…" : "Accept"} loading={busy} onPress={() => void respond("accept")} style={styles.gap} />
                <Button label="Decline" variant="secondaryOnDark" disabled={busy} onPress={confirmDecline} style={styles.smallGap} />
              </>
            )}
        </Card>
        {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  body: { paddingHorizontal: gutter, gap: 16 },
  header: { gap: 4, alignItems: "center", paddingVertical: 12 },
  eyebrow: { fontFamily: fonts.capsBold, fontSize: 11, letterSpacing: 1.2, color: colors.avatarGold },
  tripName: { textAlign: "center", fontFamily: fonts.bold, fontSize: 30, color: colors.cream },
  details: { textAlign: "center", fontFamily: fonts.regular, fontSize: 15, color: colors.boardInk },
  cardTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  note: { marginTop: 6, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
  error: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.errorOnMaroon },
  gap: { marginTop: 14 },
  smallGap: { marginTop: 8 },
});
