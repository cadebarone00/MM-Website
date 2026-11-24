import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { holeRange } from "@/lib/platform/personalRound";
import { orderPeople, picksByHole, roundGameView, roundPeople, type BoardPerson } from "@/lib/platform/roundBoard";
import { holesChoiceLabel, playersLabel } from "@/lib/platform/roundSetupForm";
import { Button } from "~/components/Button.tsx";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { Leaderboard } from "~/components/round/Leaderboard.tsx";
import { readPhoneRound, savePhoneRound, type PhoneRound } from "~/lib/roundStore.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";
import { useLiveRound } from "~/lib/useLiveRound.ts";

/**
 * A round (website PlayRound's round screen; project_specs.md "Expo app Step 0 + Step 1", part 1c): course, the live
 * leaderboard with money, and tap-a-name scorecards. A round with friends refreshes every few seconds on every phone;
 * id "phone" = the round kept only on this phone. Score entry (the pull-up scoring sheet) is Play part 3b.
 */
export default function RoundScreen() {
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === "phone" ? <PhoneRoundScreen /> : <SharedRoundScreen id={id} />;
}

function SharedRoundScreen({ id }: { id: string }) {
  const { state } = useLiveRound(id);

  if (state.status === "loading") return <Shell><View style={styles.center}><ActivityIndicator color={colors.goldBright} /><Text style={styles.note}>Loading the round…</Text></View></Shell>;
  if (state.status === "gone" || state.status === "error") {
    return (
      <Shell>
        <Card tone="dark">
          <Text style={styles.error} accessibilityRole="alert">{state.status === "gone" ? "This round was deleted by the scorekeeper, or you're no longer in it." : state.message}</Text>
          <Button label="Back to Play" variant="secondaryOnDark" onPress={() => router.navigate("/")} style={styles.gap} />
        </Card>
      </Shell>
    );
  }

  const { round, me, problem } = state;
  const isHost = round.host === me;
  const ended = round.status === "ended";
  const hostName = round.players.find((p) => p.profileId === round.host)?.name.split(/\s+/)[0] ?? "The host";
  return (
    <RoundBoard setup={round.setup} people={orderPeople(roundPeople(round, me), round.setup.playerOrder)} picks={picksByHole(round.picks)}
      subtitle={isHost ? "Round with friends · you keep score" : "Round with friends"} ended={ended} problem={problem}
      footer={isHost
        ? <Text style={styles.note}>Entering scores in the new app comes in Play part 3b. For now, keep score in the current Maroon app; this board updates live.</Text>
        : ended ? <Text style={styles.note}>Round finished. When the host scored every hole, it&apos;s saved to your Profile → Rounds.</Text>
        : <Text style={styles.note}>{hostName} is keeping score. When they submit, this round is saved to your profile.</Text>} />
  );
}

function PhoneRoundScreen() {
  const [round, setRound] = useState<PhoneRound | null | undefined>(undefined);
  useEffect(() => { readPhoneRound().then(setRound); }, []);
  const people = useMemo<BoardPerson[]>(() => round ? [{ key: "me", name: "You", handicap: round.setup.myHandicap ?? null, strokes: Array.from({ length: 18 }, () => null) }] : [], [round]);
  if (round === undefined) return <Shell><ActivityIndicator color={colors.goldBright} /></Shell>;
  if (!round) {
    return (
      <Shell>
        <Card tone="dark">
          <Text style={styles.error}>There&apos;s no round on this phone.</Text>
          <Button label="Back to Play" variant="secondaryOnDark" onPress={() => router.navigate("/")} style={styles.gap} />
        </Card>
      </Shell>
    );
  }
  return (
    <RoundBoard setup={round.setup} people={people} picks={Array.from({ length: 18 }, () => ({}))} subtitle="Your round · kept on this phone" ended={false} problem={null}
      footer={(
        <>
          <Text style={styles.note}>Entering scores in the new app comes in Play part 3b.</Text>
          <Button label="Delete this round" variant="secondaryOnDark" style={styles.gap}
            onPress={() => { void savePhoneRound(null).then(() => router.navigate("/")); }} />
        </>
      )} />
  );
}

/** The round screen's body: course header, the leaderboard, and a footer line. */
function RoundBoard({ setup, people, picks, subtitle, ended, problem, footer }: {
  setup: PhoneRound["setup"]; people: BoardPerson[]; picks: ReturnType<typeof picksByHole>; subtitle: string; ended: boolean; problem: string | null; footer: React.ReactNode;
}) {
  const view = roundGameView(setup, people, picks);
  return (
    <Shell subtitle={subtitle}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{setup.course.name}</Text>
        <Text style={styles.place}>{[setup.tee?.name, holesChoiceLabel(setup.holes), view.def?.name, ended ? "Round ended" : null].filter(Boolean).join(" · ")}</Text>
        {problem && <Text style={styles.problem} accessibilityRole="alert">{problem}</Text>}
        <Leaderboard rows={view.rows} par={view.par} range={holeRange(setup.holes)} result={view.result} holeMoney={view.holeMoney} extraMoney={view.extraMoney} doubled={view.doubled} />
        {view.def && !view.gameFits && <Text style={styles.warn}>{view.def.name} needs {playersLabel(view.def.players)}; there are {view.gamePlayers.length} in the round, so it isn&apos;t scored right now.</Text>}
        <View style={styles.footer}>{footer}</View>
      </ScrollView>
    </Shell>
  );
}

function Shell({ children, subtitle = "Your round" }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}><PageHeader title={subtitle} back onBack={() => router.navigate("/")} tone="dark" /></View>
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon950 },
  gutter: { paddingHorizontal: gutter },
  body: { flex: 1, paddingHorizontal: gutter },
  content: { paddingBottom: 48, gap: 6 },
  center: { alignItems: "center", gap: 10, paddingTop: 40 },
  title: { fontFamily: fonts.regular, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: colors.homeCream },
  place: { marginTop: 4, marginBottom: 14, fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.boardInk },
  warn: { marginTop: 8, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.boardLink },
  error: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.errorOnMaroon },
  problem: { marginBottom: 8, padding: 10, borderRadius: 10, overflow: "hidden", backgroundColor: colors.problem, color: colors.white, fontFamily: fonts.semibold, fontSize: 13 },
  footer: { marginTop: 18, gap: 8 },
  gap: { marginTop: 12 },
});
