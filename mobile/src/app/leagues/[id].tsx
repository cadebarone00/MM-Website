import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cardOf, groupOrder, type League, type LeagueGroup } from "@/lib/platform/leagues";
import type { HoleInput } from "@/lib/platform/roundGames";
import { LeagueSettings } from "~/components/leagues/LeagueSettings.tsx";
import { GroupGameView, groupGame, LeaderboardView, PairsView, SkinsView, TeeTimesView } from "~/components/leagues/LeagueViews.tsx";
import { ScoringSheet } from "~/components/round/ScoringSheet.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { firstName } from "~/lib/leaguesUi.ts";
import { apiJson } from "~/lib/api.ts";
import { postLeague, useLeague, type Act } from "~/lib/useLeague.ts";
import { emptyStats } from "~/lib/useRoundScoring.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Section = "Leaderboard" | "Skins" | "Pairs" | "Group" | "Tee Times";

/**
 * A league (website LeagueHome; project_specs.md "Expo app Step 5", part 5a): name, course, then Leaderboard · Skins ·
 * Pairs · Group · Tee Times. The group's scorer keeps the whole group's card in the Play tuck-in scoring sheet (par is
 * reference only); everyone else sees who keeps it. Refreshes every 5 seconds while open.
 */
export default function LeagueScreen() {
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league, meId, problem, setProblem, load, act } = useLeague(id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<Section>("Leaderboard");
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!league || meId === null) {
    return (
      <SafeAreaView style={styles.page} edges={["top"]}>
        <TopBar />
        <View style={styles.gutter}><StateSlot height={240} tone="dark" state={problem ? { kind: "error", message: problem, onRetry: () => void load() } : { kind: "loading" }} /></View>
      </SafeAreaView>
    );
  }

  const isOrganizer = league.organizer === meId;
  const myGroup = league.groups.find((g) => g.players.includes(meId)) ?? null;
  const live = league.status === "live";
  const sections: Section[] = ["Leaderboard", ...(league.skins.on ? ["Skins" as const] : []), ...(league.pairs.on ? ["Pairs" as const] : []), ...(myGroup ? ["Group" as const] : []), "Tee Times"];
  const tab = sections.includes(section) ? section : "Leaderboard";
  const settings = (next: Partial<Pick<League, "scoring" | "skins" | "pairs">>) => act({ action: "settings", scoring: next.scoring ?? league.scoring, skins: next.skins ?? league.skins, pairs: next.pairs ?? league.pairs });
  const scorer = live && myGroup?.scorer === meId ? myGroup : null;

  return (
    <View style={styles.page}>
      <SafeAreaView edges={["top"]}><TopBar onSettings={isOrganizer ? () => setSettingsOpen(true) : undefined} /></SafeAreaView>
      <ScrollView contentContainerStyle={[styles.content, scorer && styles.roomForSheet]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} />}>
        <Text style={styles.name} accessibilityRole="header">{league.name}</Text>
        <Text style={styles.course}>{`${league.course.name}${live ? "" : " · Ended"}`}</Text>
        {problem && <Text style={styles.problem} accessibilityRole="alert">{problem}</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {sections.map((name) => (
            <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setSection(name)} style={[styles.tab, tab === name && styles.tabOn]}>
              <Text style={[styles.tabText, tab === name && styles.tabTextOn]}>{name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {tab === "Leaderboard" ? <LeaderboardView league={league} meId={meId} />
          : tab === "Skins" ? <SkinsView league={league} isOrganizer={isOrganizer && live} onCarryover={(carryover) => void settings({ skins: { ...league.skins, carryover } })} />
          : tab === "Pairs" ? <PairsView league={league} meId={meId} />
          : tab === "Group" && myGroup ? <GroupGameView league={league} group={myGroup} meId={meId} editable={live && !myGroup.submitted}
            onGame={(game) => void act({ action: "game", group: myGroup.number, game, inputs: [] })} />
          : <TeeTimesView league={league} meId={meId} isOrganizer={isOrganizer} />}
        {live && myGroup && myGroup.scorer !== meId && (
          <Text style={styles.keeps}>{`${league.players.find((p) => p.profileId === myGroup.scorer)?.name ?? "Your scorer"} keeps your group's card.`}</Text>
        )}
      </ScrollView>
      {scorer && <GroupScoring key={scorer.number} league={league} group={scorer} act={act} />}
      {isOrganizer && (
        <LeagueSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} league={league} problem={problem} onSettings={settings} act={act}
          onLive={async (next) => {
            const reply = await postLeague(id, { action: "visibility", ...next });
            setProblem(reply.ok ? null : reply.message ?? "Couldn't change who can watch. Try again.");
            void load(); return reply;
          }}
          onCopy={async (date) => {
            const reply = await postLeague(id, { action: "copy", date });
            if (!reply.ok || typeof reply.id !== "string") return reply.message ?? "Couldn't copy the league. Try again.";
            setSettingsOpen(false);
            router.replace({ pathname: "/leagues/[id]", params: { id: reply.id } });
            return null;
          }}
          onDelete={async () => {
            const reply = await apiJson(`/api/leagues/${encodeURIComponent(id)}`, { method: "DELETE" });
            if (!reply.ok) return reply.error || "Couldn't delete the league. Try again.";
            setSettingsOpen(false);
            router.back();
            return null;
          }} />
      )}
    </View>
  );
}

function TopBar({ onSettings }: { onSettings?: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Leagues" onPress={() => router.back()} style={styles.icon}>
        <SymbolView name="chevron.left" size={22} tintColor={colors.cream} />
      </Pressable>
      {onSettings && (
        <Pressable accessibilityRole="button" accessibilityLabel="League settings" onPress={onSettings} style={styles.icon}>
          <SymbolView name="gearshape" size={22} tintColor={colors.cream} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * The scorer keeps the whole group's card (website GroupScoring): everyone in the group in the Play scoring sheet, the
 * group game's taps per hole, then Submit on the Card (the group's scores lock).
 */
function GroupScoring({ league, group, act }: { league: League; group: LeagueGroup; act: Act }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [stats, setStats] = useState(emptyStats);
  const order = groupOrder(group);
  const people = useMemo(() => order.map((id) => ({ key: id, name: firstName(league.players.find((p) => p.profileId === id)?.name ?? "Player"), strokes: cardOf(league, id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, group]);
  const game = groupGame(league, group);
  const inputs = group.inputs ?? [];
  const setPick = (hole: number, next: HoleInput) => {
    const all = Array.from({ length: 18 }, (_, h) => (h === hole ? { ...inputs[h], ...next } : inputs[h] ?? {}));
    void act({ action: "game", group: group.number, game: group.game ?? null, inputs: all });
  };
  async function submit() {
    setSubmitting(true); setProblem(null);
    const reply = await act({ action: "submit", group: group.number });
    setSubmitting(false);
    if (!reply.ok) setProblem(reply.message ?? "Couldn't submit. Try again.");
    else setOpen(false);
  }
  return (
    <ScoringSheet open={open} onOpenChange={setOpen} people={people} meKey={group.scorer} par={league.course.par} range={[0, 18]} stats={false}
      myStats={stats} onMyStats={setStats} onStrokes={(key, hole, strokes) => void act({ action: "strokes", player: key, hole: hole + 1, strokes })}
      onFinish={() => {}} holeAlert={() => false} game={game?.config ?? null} gameFits={!!game} sideGames={undefined} inputs={inputs} onPick={setPick}
      onSubmit={() => void submit()} submitting={submitting} locked={Boolean(group.submitted)} referencePar
      cardNotice={problem ? <Text style={styles.sheetProblem}>{problem}</Text> : group.submitted ? <Text style={styles.sheetNote}>Card in. The group&apos;s scores are locked.</Text> : undefined} />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter - 8, minHeight: minTap },
  icon: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  content: { gap: 12, paddingHorizontal: gutter, paddingBottom: 48 },
  roomForSheet: { paddingBottom: 160 },
  name: { fontFamily: fonts.bold, fontSize: 30, color: colors.cream },
  course: { marginTop: -6, fontFamily: fonts.regular, fontSize: 16, color: colors.wizardMuted },
  problem: { fontFamily: fonts.semibold, fontSize: 14, color: colors.errorOnMaroon },
  tabs: { gap: 8, paddingVertical: 4 },
  tab: { minHeight: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.wizardLine },
  tabOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  tabText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  tabTextOn: { color: colors.maroon900 },
  keeps: { fontFamily: fonts.regular, fontSize: 14, color: colors.wizardMuted, textAlign: "center" },
  sheetProblem: { fontFamily: fonts.semibold, fontSize: 14, color: colors.error },
  sheetNote: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted },
});
