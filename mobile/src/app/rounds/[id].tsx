import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { holeRange, type PersonalRoundSetup } from "@/lib/platform/personalRound";
import type { PlayerRound, ShotResult } from "@/lib/platform/playerRounds";
import type { HoleInput } from "@/lib/platform/roundGames";
import { orderPeople, picksByHole, roundGameView, roundPeople, type BoardPerson } from "@/lib/platform/roundBoard";
import { submitCard } from "@/lib/platform/roundScoring";
import { firstName, holesChoiceLabel, playersLabel } from "@/lib/platform/roundSetupForm";
import type { SharedRound } from "@/lib/platform/sharedRoundTypes";
import { Button } from "~/components/Button.tsx";
import { Card } from "~/components/Card.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { Leaderboard } from "~/components/round/Leaderboard.tsx";
import { ScoringSheet } from "~/components/round/ScoringSheet.tsx";
import { TUCKED_HEIGHT } from "~/components/round/TuckSheet.tsx";
import { apiJson } from "~/lib/api.ts";
import { readPhoneRound, saveBuiltPars, savePhoneRound, type PhoneRound } from "~/lib/roundStore.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";
import { useLiveRound } from "~/lib/useLiveRound.ts";
import { emptyStats, readMyStats, saveMyStats, useRoundScoring, type MyStats } from "~/lib/useRoundScoring.ts";

type Saved = { round: PlayerRound; members: { name: string; saved: boolean }[] };
const SUBMIT_ERRORS: Partial<Record<string, string>> = {
  not_installed: "Rounds can't be saved yet: the rounds database hasn't been set up. Your scores are kept in the round.",
};

/**
 * A round (website PlayRound's round screen; project_specs.md "Expo app Step 0 + Step 1", parts 1c/3a–3b): the course,
 * the live leaderboard with money, tap-a-name scorecards, and — for the scorekeeper — the Scoring sheet and Submit &
 * Save. A round with friends refreshes every few seconds; id "phone" = the round kept only on this phone.
 */
export default function RoundScreen() {
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === "phone" ? <PhoneRoundScreen /> : <SharedRoundScreen id={id} />;
}

/** Submit & Save (website submitCard): my card, and the server saves every joined player's too. */
async function submitRound(setup: PersonalRoundSetup, strokes: (number | null)[], stats: MyStats, startedAt: string): Promise<{ ok: true; saved: Saved } | { ok: false; message: string }> {
  const card = submitCard({ par: setup.course.par, holes: setup.holes, strokes, ...stats, stats: setup.stats });
  const reply = await apiJson<{ round?: PlayerRound; members?: Saved["members"] }>("/api/rounds/personal", { method: "POST", body: { setup, card, startedAt }, messages: SUBMIT_ERRORS });
  if (reply.ok && reply.body.round) return { ok: true, saved: { round: reply.body.round, members: reply.body.members ?? [] } };
  return { ok: false, message: !reply.ok && reply.code === null ? "No connection. Your scores are kept; try again when you're back online." : !reply.ok && reply.code === "not_installed" ? reply.error : "Couldn't save the round. Your scores are kept; try again." };
}

function SharedRoundScreen({ id }: { id: string }) {
  const { state } = useLiveRound(id);
  const round = state.status === "ready" ? state.round : null;
  const me = state.status === "ready" ? state.me : null;
  const scoring = useRoundScoring(id, round, me);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [myStats, setMyStats] = useState<MyStats>(emptyStats);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { readMyStats(id).then(setMyStats); }, [id]);
  const changeStats = useCallback((next: MyStats) => { setMyStats(next); void saveMyStats(id, next); }, [id]);

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

  const { setup } = state.round;
  const isHost = state.round.host === state.me;
  const ended = state.round.status === "ended";
  const people = orderPeople(roundPeople(state.round, state.me, scoring.strokesOf, scoring.guestRow), setup.playerOrder);
  const view = roundGameView(setup, people, scoring.inputs);
  const range = holeRange(setup.holes);
  const hostName = firstName(state.round.players.find((p) => p.profileId === state.round.host)?.name ?? "The host");
  const others = people.filter((p) => p.key !== state.me).map((p) => p.key);

  async function submit() {
    setSubmitting(true);
    setSaveError(null);
    const result = await submitRound(setup, scoring.strokesOf(state.status === "ready" ? state.me : ""), myStats, id);
    setSubmitting(false);
    if (!result.ok) { setSaveError(result.message); return; }
    void saveMyStats(id, null);
    setSheetOpen(false);
    setSaved(result.saved);
  }
  const changePar = setup.course.custom && !ended ? (hole: number, value: number) => {
    const next = { ...setup, course: { ...setup.course, par: setup.course.par.map((p, h) => h === hole ? value : p) } };
    void saveBuiltPars(next.course.ref, next.course.par);
    void apiJson(`/api/rounds/shared/${encodeURIComponent(id)}`, { method: "POST", body: { action: "setup", setup: next } });
  } : undefined;

  return (
    <>
      <RoundBody setup={setup} people={people} inputs={scoring.inputs} subtitle={isHost ? "Round with friends · you keep score" : "Round with friends"} ended={ended}
        problem={scoring.problem ?? state.problem}
        footer={saved ? <SavedPanel saved={saved} />
          : isHost ? (
            <>
              {saveError && <Text style={styles.error} accessibilityRole="alert">{saveError}</Text>}
              <Text style={styles.note}>{submitting ? "Saving your round…" : "Pull up Scoring to enter each hole. Submit & Save is on the Card once every hole is in."}</Text>
            </>
          )
          : ended ? <><Text style={styles.note}>Round finished. When the host scored every hole, it&apos;s saved to your Profile → Rounds.</Text><Button label="See my rounds" onPress={() => router.navigate("/profile")} style={styles.gap} /></>
          : (
            <>
              <Text style={styles.note}>{hostName} is keeping score. When they submit, this round is saved to your profile.</Text>
              {setup.playerStats && <FriendStats round={state.round} me={state.me} send={scoring.sendStats} />}
            </>
          )} />
      {isHost && !ended && !saved && (
        <>
              <ScoringSheet open={sheetOpen} onOpenChange={setSheetOpen} people={people} meKey={state.me} par={view.par} range={range} stats={setup.stats}
            myStats={myStats} onMyStats={changeStats} onStrokes={scoring.setStrokes} onFinish={(hole) => scoring.finishHole(hole, view.par, others)}
            holeAlert={(h) => setup.game?.id === "wolf" && view.gameFits && scoring.inputs[h]?.wolfPartner === undefined && people.every((p) => p.strokes[h] != null)}
            game={setup.game ?? null} gameFits={view.gameFits} sideGames={setup.sideGames} inputs={scoring.inputs} onPick={scoring.setPick}
            onParChange={changePar} onSubmit={() => void submit()} submitting={submitting} locked={ended} />
        </>
      )}
    </>
  );
}

/** The round kept only on this phone (rounds with friends not set up in the database): just me, scored on the phone. */
function PhoneRoundScreen() {
  const [round, setRound] = useState<PhoneRound | null | undefined>(undefined);
  const [myStats, setMyStats] = useState<MyStats>(emptyStats);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { readPhoneRound().then(setRound); readMyStats("phone").then(setMyStats); }, []);
  const strokes = useMemo(() => round?.strokes ?? Array.from({ length: 18 }, () => null as number | null), [round]);
  const people = useMemo<BoardPerson[]>(() => round ? [{ key: "me", name: "You", handicap: round.setup.myHandicap ?? null, strokes }] : [], [round, strokes]);

  if (round === undefined) return <Shell><ActivityIndicator color={colors.goldBright} /></Shell>;
  if (!round && !saved) {
    return (
      <Shell>
        <Card tone="dark">
          <Text style={styles.error}>There&apos;s no round on this phone.</Text>
          <Button label="Back to Play" variant="secondaryOnDark" onPress={() => router.navigate("/")} style={styles.gap} />
        </Card>
      </Shell>
    );
  }
  if (!round) return <Shell><ScrollView contentContainerStyle={styles.content}>{saved && <SavedPanel saved={saved} />}</ScrollView></Shell>;

  const update = (next: PhoneRound) => { setRound(next); void savePhoneRound(next); };
  const setStroke = (_key: string, hole: number, value: number) => update({ ...round, strokes: strokes.map((s, h) => h === hole ? value : s) });
  async function submit() {
    if (!round) return;
    setSubmitting(true);
    setSaveError(null);
    const result = await submitRound(round.setup, strokes, myStats, round.startedAt);
    setSubmitting(false);
    if (!result.ok) { setSaveError(result.message); return; }
    void saveMyStats("phone", null);
    void savePhoneRound(null);
    setSheetOpen(false);
    setSaved(result.saved);
    setRound(null);
  }

  return (
    <>
      <RoundBody setup={round.setup} people={people} inputs={Array.from({ length: 18 }, () => ({}))} subtitle="Your round · kept on this phone" ended={false} problem={null}
        footer={(
          <>
            {saveError && <Text style={styles.error} accessibilityRole="alert">{saveError}</Text>}
            <Text style={styles.note}>{submitting ? "Saving your round…" : "Pull up Scoring to enter each hole. Submit & Save is on the Card once every hole is in."}</Text>
            <Button label="Delete this round" variant="secondaryOnDark" style={styles.gap} onPress={() => { void savePhoneRound(null).then(() => router.navigate("/")); }} />
          </>
        )} />
      <ScoringSheet open={sheetOpen} onOpenChange={setSheetOpen} people={people} meKey="me" par={round.setup.course.par} range={holeRange(round.setup.holes)} stats={round.setup.stats}
        myStats={myStats} onMyStats={(next) => { setMyStats(next); void saveMyStats("phone", next); }} onStrokes={setStroke}
        onFinish={(hole) => { if (strokes[hole] == null) setStroke("me", hole, round.setup.course.par[hole]); }} holeAlert={() => false}
        game={null} gameFits sideGames={undefined} inputs={Array.from({ length: 18 }, () => ({}))} onPick={() => {}}
        onParChange={round.setup.course.custom ? (hole, value) => {
          const next = { ...round, setup: { ...round.setup, course: { ...round.setup.course, par: round.setup.course.par.map((p, h) => h === hole ? value : p) } } };
          void saveBuiltPars(next.setup.course.ref, next.setup.course.par);
          update(next);
        } : undefined}
        onSubmit={() => void submit()} submitting={submitting} locked={false} />
    </>
  );
}

/** The round screen's body: course header, the leaderboard, and a footer. */
function RoundBody({ setup, people, inputs, subtitle, ended, problem, footer }: {
  setup: PersonalRoundSetup; people: BoardPerson[]; inputs: HoleInput[]; subtitle: string; ended: boolean; problem: string | null; footer: ReactNode;
}) {
  const view = roundGameView(setup, people, inputs);
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

/** After Submit & Save (website RoundStatus): total, whether it counts, who else it was saved for. */
function SavedPanel({ saved }: { saved: Saved }) {
  const yes = saved.members.filter((m) => m.saved).map((m) => firstName(m.name));
  const no = saved.members.filter((m) => !m.saved).map((m) => firstName(m.name));
  return (
    <Card tone="dark">
      <Text style={styles.savedTotal}>{saved.round.total}</Text>
      <Text style={styles.savedText}>Round saved. {saved.round.countsForHandicap ? "It counts toward your handicap." : `Not counted: ${saved.round.notCountedReason}.`}</Text>
      {yes.length > 0 && <Text style={styles.savedText}>Also saved to {yes.join(", ")}&apos;s {yes.length === 1 ? "profile" : "profiles"}.</Text>}
      {no.length > 0 && <Text style={styles.error}>Not saved for {no.join(", ")}: not every hole was scored for them.</Text>}
      <Button label="See my rounds" onPress={() => router.navigate("/profile")} style={styles.gap} />
      <Button label="Back to Play" variant="secondaryOnDark" onPress={() => router.navigate("/")} style={styles.smallGap} />
    </Card>
  );
}

/** A joined player's own putts / fairway / green, hole by hole (website MyStats), when the host turned player stats on. */
function FriendStats({ round, me, send }: { round: SharedRound; me: string; send: (key: string, value: unknown, body: object) => Promise<void> }) {
  const range = holeRange(round.setup.holes);
  const par = round.setup.course.par;
  const [hole, setHole] = useState(range[0]);
  const [mine, setMine] = useState<Record<number, { putts: number | null; fairway: ShotResult | null; green: ShotResult | null }>>({});
  const saved = round.holes.find((h) => h.profileId === me && h.hole === hole + 1);
  const stats = mine[hole] ?? { putts: saved?.putts ?? null, fairway: saved?.fairway ?? null, green: saved?.green ?? null };
  const set = (part: Partial<typeof stats>) => {
    const next = { ...stats, ...part };
    setMine((all) => ({ ...all, [hole]: next }));
    void send(`stats:${hole}`, next, { action: "stats", hole: hole + 1, ...next });
  };
  const choose = (label: string, value: ShotResult | null, options: [ShotResult, string][], key: "fairway" | "green") => (
    <View style={styles.statLine} accessibilityLabel={label}>
      <Text style={styles.statLabel}>{label}</Text>
      {options.map(([v, text]) => (
        <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: value === v }} onPress={() => set({ [key]: value === v ? null : v })} style={[styles.statChip, value === v && styles.statChipOn]}>
          <Text style={[styles.statChipText, value === v && styles.statChipTextOn]}>{text}</Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <Card tone="dark">
      <Text style={styles.cardTitle}>My stats</Text>
      <View style={styles.statHole}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous hole" disabled={hole <= range[0]} onPress={() => setHole(hole - 1)} style={styles.arrow}><SymbolView name="chevron.left" size={16} tintColor={colors.cream} /></Pressable>
        <Text style={styles.statHoleText}>Hole {hole + 1} · Par {par[hole]}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next hole" disabled={hole >= range[1] - 1} onPress={() => setHole(hole + 1)} style={styles.arrow}><SymbolView name="chevron.right" size={16} tintColor={colors.cream} /></Pressable>
      </View>
      <View style={styles.statLine}>
        <Text style={styles.statLabel}>Putts</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Fewer putts" disabled={(stats.putts ?? 0) <= 0} onPress={() => set({ putts: Math.max(0, (stats.putts ?? 0) - 1) })} style={styles.statChip}><Text style={styles.statChipText}>−</Text></Pressable>
        <Text style={styles.statValue}>{stats.putts ?? "–"}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="More putts" disabled={(stats.putts ?? 0) >= 10} onPress={() => set({ putts: Math.min(10, (stats.putts ?? 0) + 1) })} style={styles.statChip}><Text style={styles.statChipText}>+</Text></Pressable>
      </View>
      {par[hole] > 3 && choose("Fairway", stats.fairway, [["left", "Left"], ["center", "Hit"], ["right", "Right"]], "fairway")}
      {choose("Green", stats.green, [["center", "Hit"], ["up", "Long"], ["down", "Short"], ["left", "Left"], ["right", "Right"]], "green")}
    </Card>
  );
}

function Shell({ children, subtitle = "Your round" }: { children: ReactNode; subtitle?: string }) {
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
  // Room at the bottom so the tucked Scoring sheet never covers the last line.
  content: { paddingBottom: TUCKED_HEIGHT + 56, gap: 6 },
  center: { alignItems: "center", gap: 10, paddingTop: 40 },
  title: { fontFamily: fonts.regular, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: colors.homeCream },
  place: { marginTop: 4, marginBottom: 14, fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.boardInk },
  warn: { marginTop: 8, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.boardLink },
  error: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.errorOnMaroon },
  savedText: { marginTop: 4, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.cream },
  problem: { marginBottom: 8, padding: 10, borderRadius: 10, overflow: "hidden", backgroundColor: colors.problem, color: colors.white, fontFamily: fonts.semibold, fontSize: 13 },
  footer: { marginTop: 18, gap: 8 },
  gap: { marginTop: 12 },
  smallGap: { marginTop: 8 },
  pressed: { opacity: 0.85 },
  savedTotal: { fontFamily: fonts.bold, fontSize: 44, color: colors.goldBright },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream, marginBottom: 6 },
  statHole: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  statHoleText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  arrow: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  statLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  statLabel: { width: 64, fontFamily: fonts.regular, fontSize: 14, color: colors.wizardMuted },
  statValue: { width: 26, textAlign: "center", fontFamily: fonts.bold, fontSize: 18, color: colors.white },
  statChip: { minHeight: 38, minWidth: 38, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: colors.wizardLine },
  statChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  statChipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  statChipTextOn: { color: colors.maroon900 },
});
