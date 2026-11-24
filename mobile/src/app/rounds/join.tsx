import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCode } from "@/lib/platform/codeTournaments";
import { Button } from "~/components/Button.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { apiJson } from "~/lib/api.ts";
import { gameName, holesLabel, typedJoinCode } from "~/lib/play.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";

/** What the server says a code opens (server type RoundLookup in lib/platform/joinCodesServer). */
type RoundLookup = { roundId: string; hostName: string; course: string | null; holes: string | null; game: string | null; status: "live" | "ended"; playerCount: number; member: boolean };
type Look = { status: "loading" } | { status: "found"; round: RoundLookup } | { status: "missing" } | { status: "error"; message: string };

const MESSAGES = {
  not_installed: "Round codes aren't set up in the database yet.",
  signed_out: "Sign in to join this round.",
};

/** Join a friend's round with its code (website RoundJoin): what the round is, then Join round. Up to 5 players. */
export default function JoinRound() {
  useLightStatusBar();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typedJoinCode(params.code ?? "");
  const [look, setLook] = useState<Look>(code.length === 6 ? { status: "loading" } : { status: "missing" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (code.length !== 6) return;
    let live = true;
    apiJson<{ round?: RoundLookup | null }>(`/api/rounds/join?code=${encodeURIComponent(code)}`, { messages: MESSAGES }).then((reply) => {
      if (!live) return;
      if (!reply.ok) setLook({ status: "error", message: reply.code ? reply.error : "Couldn't look up that code. Try again." });
      else setLook(reply.body.round ? { status: "found", round: reply.body.round } : { status: "missing" });
    });
    return () => { live = false; };
  }, [code]);

  async function join() {
    setBusy(true);
    setError(null);
    const reply = await apiJson<{ id?: string }>("/api/rounds/join", { method: "POST", body: { code }, messages: MESSAGES });
    setBusy(false);
    if (reply.ok && reply.body.id) { router.replace({ pathname: "/rounds/[id]", params: { id: reply.body.id } }); return; }
    setError(reply.ok ? "Couldn't join the round. Try again." : reply.error);
  }

  const openRound = (id: string) => router.replace({ pathname: "/rounds/[id]", params: { id } });
  const round = look.status === "found" ? look.round : null;
  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <View style={styles.gutter}><PageHeader title={`Join a round${code.length === 6 ? ` · ${formatCode(code)}` : ""}`} back tone="dark" /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          {look.status === "loading" && <View style={styles.center}><ActivityIndicator color={colors.goldBright} /><Text style={styles.note}>Looking up the code…</Text></View>}
          {look.status === "missing" && (
            <>
              <Text style={styles.error} accessibilityRole="alert">
                {code.length === 6 ? `No round has the code ${formatCode(code)}. Check it with your friend and try again.` : "That link is missing its code."}
              </Text>
              <Button label="Back to Play" variant="secondaryOnDark" onPress={() => router.back()} />
            </>
          )}
          {look.status === "error" && <Text style={styles.error} accessibilityRole="alert">{look.message}</Text>}
          {round && (
            <>
              <Text style={styles.title}>{round.course ?? "A round"}</Text>
              <Text style={styles.place}>
                {[holesLabel(round.holes), gameName(round.game), `Hosted by ${round.hostName}`, `${round.playerCount} of 5 players`].filter(Boolean).join(" · ")}
              </Text>
              {round.member ? <Button label="You're in. Open the round" onPress={() => openRound(round.roundId)} />
                : round.status === "ended" ? <Text style={styles.error} accessibilityRole="alert">This round has ended.</Text>
                : round.playerCount >= 5 ? <Text style={styles.error} accessibilityRole="alert">This round is full (5 players).</Text>
                : (
                  <>
                    <Text style={styles.blurb}>You&apos;ll see the live scorecard and standings, and the host keeps score.</Text>
                    {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
                    <Button label="Join round" loading={busy} onPress={join} />
                  </>
                )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon950 },
  gutter: { paddingHorizontal: gutter },
  content: { padding: gutter },
  panel: { gap: 12, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.inviteFill, minHeight: 200, justifyContent: "center" },
  center: { alignItems: "center", gap: 10 },
  note: { fontFamily: fonts.regular, fontSize: 15, color: colors.boardInk },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.cream },
  place: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
  blurb: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.boardInk },
  error: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.errorOnMaroon },
});
