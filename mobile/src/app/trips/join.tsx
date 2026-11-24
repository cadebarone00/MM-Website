import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tripDateRange } from "@/lib/platform/golfTripCreate";
import { joinResultFromJson, tripJoinValue, type JoinPreview } from "@/lib/platform/golfTripJoinLinks";
import { joinPageState } from "@/lib/platform/joinPageState";
import { Button } from "~/components/Button.tsx";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { apiJson, apiRaw } from "~/lib/api.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Look = { status: "loading" } | { status: "ready"; preview: JoinPreview | null } | { status: "error"; message: string };
const openTrip = (tripId: string, name?: string) => router.replace({ pathname: "/trips/[id]", params: { id: tripId, ...(name ? { name } : {}) } });

/**
 * Join a trip with its 6-character code or 30-minute link (website GolfTripJoinLink; GET/POST /api/golf-trips/join/<code>).
 * The page states come from the shared joinPageState (the app is always signed in).
 */
export default function JoinTrip() {
  useLightStatusBar();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = tripJoinValue(params.code);
  const [look, setLook] = useState<Look>(code ? { status: "loading" } : { status: "ready", preview: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!code) return;
    let live = true;
    apiJson<{ preview?: JoinPreview | null }>(`/api/golf-trips/join/${encodeURIComponent(code)}`).then((reply) => {
      if (!live) return;
      setLook(reply.ok ? { status: "ready", preview: reply.body.preview ?? null } : { status: "error", message: reply.error });
    });
    return () => { live = false; };
  }, [code]);

  async function join() {
    if (!code) return;
    setBusy(true);
    setError(null);
    const reply = await apiRaw<{ error?: string }>(`/api/golf-trips/join/${encodeURIComponent(code)}`, { method: "POST" });
    setBusy(false);
    const result = joinResultFromJson(reply.body);
    if (reply.status >= 200 && reply.status < 300 && (result.status === "joined" || result.status === "already_member")) { openTrip(result.tripId); return; }
    if (result.status === "expired") { setExpired(true); return; }
    setError(reply.status === 0 ? "We couldn't reach the server. Check your connection and try again." : reply.body?.error ?? "This invite link isn't working anymore.");
  }

  const preview = look.status === "ready" ? look.preview : null;
  const shown = expired ? "expired" : look.status === "ready" ? joinPageState(preview, true) : null;
  const typedCode = code?.length === 6;
  const dates = preview ? tripDateRange(preview.startDate, preview.endDate) : null;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title="Join a trip" back tone="dark" /></View>
      <View style={styles.body}>
        {preview && shown !== "invalid" && (
          <View style={styles.header}>
            <Text style={styles.eyebrow}>GOLF TRIP INVITE</Text>
            <Text style={styles.tripName}>{preview.tripName}</Text>
            <Text style={styles.details}>{[dates, preview.destination].filter(Boolean).join(" · ")}</Text>
            {preview.organizerName ? <Text style={styles.details}>Organized by {preview.organizerName}</Text> : null}
          </View>
        )}
        <Card tone="dark">
          {look.status === "loading" ? <ActivityIndicator color={colors.goldBright} />
            : look.status === "error" ? <Text style={styles.error}>{look.message}</Text>
            : shown === "invalid" ? (
              <>
                <Text style={styles.cardTitle}>{typedCode ? "That code isn't working" : "This invite link isn't working"}</Text>
                <Text style={styles.note}>{typedCode ? "No trip has that code. Check it with the organizer, who can also make a new one." : "It may have been replaced by a newer link. Ask the organizer for a new one."}</Text>
                <Button label="Go to Golf Trips" variant="secondaryOnDark" onPress={() => router.navigate("/golf-trips")} style={styles.gap} />
              </>
            ) : shown === "expired" ? (
              <>
                <Text style={styles.cardTitle}>This invite link expired</Text>
                <Text style={styles.note}>Invite links last 30 minutes. Ask anyone on the trip to send you a new one.</Text>
                <Button label="Go to Golf Trips" variant="secondaryOnDark" onPress={() => router.navigate("/golf-trips")} style={styles.gap} />
              </>
            ) : shown === "member" && preview ? (
              <>
                <Text style={styles.cardTitle}>You&apos;re already in this trip</Text>
                <Button label="Open trip" onPress={() => openTrip(preview.tripId, preview.tripName)} style={styles.gap} />
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Join this trip</Text>
                <Button label={busy ? "Joining…" : "Join trip"} loading={busy} onPress={join} style={styles.gap} />
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
});
