import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { isCustomRef } from "@/lib/platform/golfGps/courseRefs";
import { customCourse, holeRange, type ScoringCourse } from "@/lib/platform/personalRound";
import { stakeUnit, type GameId } from "@/lib/platform/roundGames";
import {
  buildRoundSetup, emptyRoundSetupForm, firstName, handicapValue, PAGE_TITLES, playersLabel, reviewLines, SETUP_PAGES,
  stakeText, startErrorMessage, type RoundSetupForm, type SetupPage,
} from "@/lib/platform/roundSetupForm";
import { DateField } from "~/components/DateField.tsx";
import { PillToggle } from "~/components/PillToggle.tsx";
import { SelectField } from "~/components/SelectField.tsx";
import { GamePicker } from "~/components/setup/GamePicker.tsx";
import { HolePicker } from "~/components/setup/HolePicker.tsx";
import { PlayersEditor } from "~/components/setup/PlayersEditor.tsx";
import { Wizard, WizardChoices, WizardField, WizardNote, WizardSection } from "~/components/setup/Wizard.tsx";
import { apiJson } from "~/lib/api.ts";
import { builtPars, readPhoneRound, savePhoneRound, takePickedCourse, type PhoneRound, type PickedCourse } from "~/lib/roundStore.ts";
import { dayDate, dayText } from "~/lib/setupHelpers.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

type CourseLoad = { status: "none" } | { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

/**
 * Play → Start a round (website PlayRound SetupStep; project_specs.md "Expo app Step 0 + Step 1", part 1b): 4 pages in
 * the trip builder's look — Your round · Who's playing? · The game · Ready to tee off? → Start round. Every choice is
 * turned into the round by the shared rules (lib/platform/roundSetupForm.ts), the same ones the website uses.
 * Opened from Play home's course search with the course already picked (?ref&name&place).
 */
export default function NewRound() {
  useLightStatusBar();
  const params = useLocalSearchParams<{ ref?: string; name?: string; place?: string }>();
  const [page, setPage] = useState<SetupPage>("round");
  const [form, setForm] = useState<RoundSetupForm>(() => emptyRoundSetupForm(dayText(new Date())));
  const [picked, setPicked] = useState<PickedCourse | null>(null);
  const [load, setLoad] = useState<CourseLoad>({ status: "none" });
  const [liveId, setLiveId] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<PhoneRound | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const set = useCallback((part: Partial<RoundSetupForm>) => setForm((current) => ({ ...current, ...part })), []);
  const built = useMemo(() => buildRoundSetup(form), [form]);

  /** A course was picked: load its scorecard (a course added by hand is built while playing). */
  const pick = useCallback(async (next: PickedCourse) => {
    setPicked(next);
    set({ course: null, tee: 0, longest: { on: false, value: "", holes: null }, closest: { on: false, value: "", holes: null } });
    if (isCustomRef(next.ref)) { set({ course: customCourse(next.ref, next.name, next.place, await builtPars(next.ref)) }); setLoad({ status: "ready" }); return; }
    setLoad({ status: "loading" });
    const reply = await apiJson<{ course?: ScoringCourse }>(`/api/rounds/course/${encodeURIComponent(next.ref)}`);
    if (reply.ok && reply.body.course) { set({ course: reply.body.course }); setLoad({ status: "ready" }); return; }
    setLoad({ status: "error", message: !reply.ok && reply.code === "no_scorecard" ? "This course doesn't have a scorecard on file yet." : !reply.ok && !reply.code ? "Couldn't reach the course. Check your connection." : "Couldn't load this course's scorecard right now." });
  }, [set]);

  // The course from Play home's search, once.
  useEffect(() => {
    if (params.ref && params.name) void pick({ ref: params.ref, name: params.name, place: params.place ?? "" });
  }, [params.ref, params.name, params.place, pick]);

  // Back from "Change" course search with a new pick.
  useFocusEffect(useCallback(() => {
    const next = takePickedCourse();
    if (next) void pick(next);
  }, [pick]));

  // A live round with friends (offer to rejoin) or an unfinished round kept on this phone (ask before starting over).
  useEffect(() => {
    let live = true;
    apiJson<{ id?: string | null }>("/api/rounds/shared").then((reply) => { if (live && reply.ok && reply.body.id) setLiveId(reply.body.id); });
    readPhoneRound().then((round) => { if (live && round) setUnfinished(round); });
    return () => { live = false; };
  }, []);

  async function start() {
    if (!built.setup) return;
    setStarting(true);
    setStartError(null);
    // Every round starts in the database, so there's always a code to share and friends can join any time.
    const reply = await apiJson<{ id?: string }>("/api/rounds/shared", { method: "POST", body: { setup: built.setup, invites: form.players.flatMap((p) => p.profileId ? [p.profileId] : []) } });
    setStarting(false);
    if (reply.ok && reply.body.id) { router.replace({ pathname: "/rounds/[id]", params: { id: reply.body.id } }); return; }
    // Rounds with friends not set up in this database yet: a round on my own still works (kept on this phone).
    if (!reply.ok && reply.code === "not_installed" && !form.players.length && !form.guests.length) {
      await savePhoneRound({ setup: built.setup, startedAt: new Date().toISOString() });
      router.replace({ pathname: "/rounds/[id]", params: { id: "phone" } });
      return;
    }
    // Same wording as the website (startErrorMessage); "signed_out" shows the sign-in note.
    setStartError(reply.ok ? startErrorMessage(undefined, undefined) : startErrorMessage(reply.code ?? "offline", reply.code === null ? undefined : reply.error));
  }

  const at = SETUP_PAGES.indexOf(page);
  const back = () => at === 0 ? router.back() : setPage(SETUP_PAGES[at - 1]);
  const next = () => page === "review" ? void start() : setPage(SETUP_PAGES[at + 1]);
  const { course } = form;
  const { def, fits, size, names, teamOf, teamFormat, handicapNote, longestHoles, closestHoles } = built;

  if (unfinished && !params.ref) {
    return (
      <Wizard step={0} steps={SETUP_PAGES.length} title="Unfinished round" onBack={() => router.back()} nextLabel="Pick up where I left off"
        onNext={() => router.replace({ pathname: "/rounds/[id]", params: { id: "phone" } })}>
        <WizardNote>{unfinished.setup.course.name} · started {new Date(unfinished.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</WizardNote>
        <Pressable accessibilityRole="button" style={styles.textButton} onPress={() => Alert.alert("Start a new round?", "The unfinished round will be deleted.", [
          { text: "Cancel", style: "cancel" },
          { text: "Start new", style: "destructive", onPress: () => { void savePhoneRound(null); setUnfinished(null); } },
        ])}>
          <Text style={styles.textButtonText}>Start a new round</Text>
        </Pressable>
      </Wizard>
    );
  }

  return (
    <Wizard step={at} steps={SETUP_PAGES.length} title={PAGE_TITLES[page]} onBack={back}
      nextLabel={page === "review" ? (starting ? "Starting…" : "Start round") : "Next"} onNext={next}
      nextDisabled={page === "review" ? !built.setup : !built.canNext(page)} busy={starting}>
      {page === "round" && (
        <>
          {!picked && liveId && (
            <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/rounds/[id]", params: { id: liveId } })} style={styles.banner}>
              <Text style={styles.bannerText}>You have a round with friends in progress. <Text style={styles.bold}>Rejoin ›</Text></Text>
            </Pressable>
          )}
          {picked ? (
            <View style={styles.picked}>
              <View style={styles.pickedText}>
                <Text style={styles.pickedName} numberOfLines={2}>{picked.name}</Text>
                {picked.place ? <Text style={styles.pickedPlace}>{picked.place}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Change course" onPress={() => router.push({ pathname: "/courses/search", params: { for: "setup" } })}>
                <Text style={styles.change}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/courses/search", params: { for: "setup" } })} style={styles.search}>
              <SymbolView name="magnifyingglass" size={17} tintColor={colors.paperInkSoft} />
              <Text style={styles.searchText}>Search for a course</Text>
            </Pressable>
          )}
          {load.status === "loading" && <View style={styles.loading}><ActivityIndicator color={colors.goldBright} /><WizardNote>Loading the scorecard…</WizardNote></View>}
          {picked && load.status === "error" && (
            <>
              <WizardNote>{load.message}</WizardNote>
              <Pressable accessibilityRole="button" style={styles.buildButton} onPress={async () => { set({ course: customCourse(picked.ref, picked.name, picked.place, await builtPars(picked.ref)) }); setLoad({ status: "ready" }); }}>
                <Text style={styles.buildText}>Build the scorecard as I play</Text>
              </Pressable>
            </>
          )}
          {course && (
            <>
              {course.custom ? (
                <>
                  <WizardNote>{course.par.some((p) => p !== 4) ? "Pars from your last round here. " : "Every hole starts at par 4. "}Tap Par on the scoring screen to change a hole.</WizardNote>
                  <View style={styles.twoUp}>
                    <View style={styles.flex}><WizardField label="Course rating" value={form.rating} onChange={(rating) => set({ rating })} placeholder="e.g. 71.2" keyboard="decimal-pad" /></View>
                    <View style={styles.flex}><WizardField label="Slope" value={form.slope} onChange={(slope) => set({ slope })} placeholder="e.g. 125" keyboard="number-pad" /></View>
                  </View>
                </>
              ) : course.tees.length ? (
                <SelectField tone="dark" label="Tees" value={String(form.tee)} onChange={(value) => set({ tee: Number(value) })}
                  options={course.tees.map((t, i) => ({ value: String(i), label: t.name, detail: t.rating != null && t.slope != null ? `${t.rating} / ${t.slope}` : "No rating" }))} />
              ) : <WizardNote>No tees listed for this course.</WizardNote>}
              <WizardChoices label="Holes" value={form.holes} options={[["18", "18 holes"], ["front", "Front 9"], ["back", "Back 9"]]}
                onChange={(holes) => set({ holes, longest: { ...form.longest, holes: null }, closest: { ...form.closest, holes: null } })} />
              <DateField tone="dark" label="Date" value={dayDate(form.datePlayed)} maximumDate={new Date()} onChange={(date) => set({ datePlayed: dayText(date) })} />
              <PillToggle tone="dark" label="Track stats" note="Putts, fairways, greens" value={form.stats} onChange={(stats) => set({ stats })} />
              <PillToggle tone="dark" label="Count toward handicap" note={handicapNote} value={form.countForHandicap && !teamFormat} onChange={(countForHandicap) => set({ countForHandicap })} disabled={teamFormat} />
            </>
          )}
        </>
      )}

      {page === "players" && (
        <>
          <PlayersEditor players={form.players} guests={form.guests} onPlayers={(players) => set({ players, teams: [] })} onGuests={(guests) => set({ guests, teams: [] })} />
          <WizardNote>You keep score for everyone. Once you start, you&apos;ll get a code to send so anyone with the app can join and follow along.</WizardNote>
        </>
      )}

      {page === "game" && (
        <>
          <GamePicker gameId={form.gameId} onPick={(gameId) => set({ gameId, teams: [] })} />
          {def && <WizardNote>{def.blurb}</WizardNote>}
          {def && !fits && <WizardNote tone="warn">{def.name} needs {playersLabel(def.players)}. You have {size}: go Back to change who&apos;s playing, or pick another game.</WizardNote>}
          {fits && def?.teams && size > 2 && (
            <View style={styles.teams} accessibilityLabel="Teams">
              {names.map((name, i) => (
                <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${name}: ${teamOf(i) === 0 ? "Team 1" : "Team 2"}. Switch team`}
                  onPress={() => set({ teams: names.map((_, j) => j === i ? 1 - teamOf(j) : teamOf(j)) })} style={[styles.team, teamOf(i) === 1 && styles.teamTwo]}>
                  <Text style={[styles.teamName, teamOf(i) === 1 && styles.teamTwoText]}>{firstName(name)}</Text>
                  <Text style={[styles.teamLabel, teamOf(i) === 1 && styles.teamTwoText]}>{teamOf(i) === 0 ? "Team 1" : "Team 2"}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {def?.id === "nassau" && (
            <>
              <View style={styles.threeUp}>
                {(["Front 9", "Back 9", "Overall"] as const).map((label, i) => (
                  <View key={label} style={styles.flex}>
                    <WizardField label={label} value={form.nassau[i]} placeholder="$0" keyboard="decimal-pad"
                      onChange={(text) => set({ nassau: form.nassau.map((v, j) => j === i ? stakeText(text) : v) as [string, string, string] })} />
                  </View>
                ))}
              </View>
              <PillToggle tone="dark" label="Automatic presses" note="A new bet when a side goes 2 down on a nine" value={form.autoPress} onChange={(autoPress) => set({ autoPress })} />
            </>
          )}
          {def && def.id !== "nassau" && !def.teamFormat && (
            <WizardField label={`$ per ${stakeUnit(def.id as GameId)} (optional)`} value={form.stake} placeholder="$0" keyboard="decimal-pad" onChange={(text) => set({ stake: stakeText(text) })} />
          )}
          {def?.points && <PillToggle tone="dark" label="Birdies double" value={form.birdiesDouble} onChange={(birdiesDouble) => set({ birdiesDouble })} />}
          {def?.points && <PillToggle tone="dark" label="Eagles triple" value={form.eaglesTriple} onChange={(eaglesTriple) => set({ eaglesTriple })} />}
          {def?.id === "skins" && <PillToggle tone="dark" label="Carryovers" note="Tied holes carry to the next" value={form.carryovers} onChange={(carryovers) => set({ carryovers })} />}
          {def?.points && <PillToggle tone="dark" label="Allow doubles" note="A Double bet button on each hole" value={form.doubles} onChange={(doubles) => set({ doubles })} />}
          {def && !def.teamFormat && <PillToggle tone="dark" label="Use handicaps (net)" value={form.net} onChange={(net) => set({ net })} />}
          {def && form.net && !def.teamFormat && (
            <>
              <WizardChoices label="Handicap allowance" value={form.allowance} options={[[100, "100%"], [90, "90%"], [80, "80%"]]} onChange={(allowance) => set({ allowance })} />
              <HandicapRow name="You" value={form.myHandicap} onChange={(myHandicap) => set({ myHandicap })} />
              {form.players.map((p, i) => (
                <HandicapRow key={p.profileId ?? i} name={p.name} value={p.handicap?.toString() ?? ""}
                  onChange={(text) => set({ players: form.players.map((x, j) => j === i ? { ...x, handicap: handicapValue(text) } : x) })} />
              ))}
              {form.guests.map((g, i) => (
                <HandicapRow key={g.id} name={g.name} value={g.handicap?.toString() ?? ""}
                  onChange={(text) => set({ guests: form.guests.map((x, j) => j === i ? { ...x, handicap: handicapValue(text) } : x) })} />
              ))}
            </>
          )}

          <WizardSection>Side games</WizardSection>
          <PillToggle tone="dark" label="Greenies" note="On every par 3" value={form.greenies.on} onChange={(on) => set({ greenies: { ...form.greenies, on } })} />
          {form.greenies.on && <WizardField label="$ per greenie (optional)" value={form.greenies.value} placeholder="$0" keyboard="decimal-pad" onChange={(text) => set({ greenies: { ...form.greenies, value: stakeText(text) } })} />}
          <PillToggle tone="dark" label="Longest drive" value={form.longest.on} onChange={(on) => set({ longest: { ...form.longest, on } })} />
          {form.longest.on && (
            <>
              <WizardField label="$ per longest drive (optional)" value={form.longest.value} placeholder="$0" keyboard="decimal-pad" onChange={(text) => set({ longest: { ...form.longest, value: stakeText(text) } })} />
              <HolePicker label="Longest drive holes" par={course?.par ?? []} range={holeRange(form.holes)} selected={longestHoles} onChange={(holes) => set({ longest: { ...form.longest, holes } })} />
            </>
          )}
          <PillToggle tone="dark" label="Closest to the pin" value={form.closest.on} onChange={(on) => set({ closest: { ...form.closest, on } })} />
          {form.closest.on && (
            <>
              <WizardField label="$ per closest to the pin (optional)" value={form.closest.value} placeholder="$0" keyboard="decimal-pad" onChange={(text) => set({ closest: { ...form.closest, value: stakeText(text) } })} />
              <HolePicker label="Closest to the pin holes" par={course?.par ?? []} range={holeRange(form.holes)} selected={closestHoles} onChange={(holes) => set({ closest: { ...form.closest, holes } })} />
            </>
          )}
          <WizardNote>{def ? "Money is only shown in the standings. Nothing is paid in the app." : "Optional. Skip it to just keep score."}</WizardNote>
        </>
      )}

      {page === "review" && (
        <>
          {reviewLines(form, built).map((line) => (
            <View key={line.label} style={styles.review}>
              <Text style={styles.reviewLabel}>{line.label}</Text>
              <Text style={styles.reviewValue}>{line.value}</Text>
            </View>
          ))}
          {startError === "signed_out" ? <WizardNote tone="error">Sign in again to start a round.</WizardNote>
            : startError ? <WizardNote tone="error">{startError}</WizardNote> : null}
        </>
      )}
    </Wizard>
  );
}

/** One player's handicap for net games (−10 to 54). */
function HandicapRow({ name, value, onChange }: { name: string; value: string; onChange: (text: string) => void }) {
  return (
    <View style={styles.hcpRow}>
      <Text style={styles.hcpName} numberOfLines={1}>{name}</Text>
      <View style={styles.hcpBox}><WizardField label="Hcp" value={value} onChange={onChange} placeholder="—" keyboard="numbers-and-punctuation" maxLength={5} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontFamily: fonts.bold },
  banner: { padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.gold, backgroundColor: "rgba(201,168,110,0.14)" },
  bannerText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.cream },
  picked: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  pickedText: { flex: 1, minWidth: 0 },
  pickedName: { fontFamily: fonts.semibold, fontSize: 17, color: colors.cream },
  pickedPlace: { fontFamily: fonts.regular, fontSize: 13, color: colors.wizardMuted },
  change: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold, textDecorationLine: "underline" },
  search: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.paperBorder, borderRadius: radius.control, backgroundColor: colors.paper },
  searchText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.paperInkSoft },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 },
  buildButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.control, backgroundColor: colors.gold },
  buildText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon900 },
  twoUp: { flexDirection: "row", gap: 8 },
  threeUp: { flexDirection: "row", gap: 8 },
  teams: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  team: { minWidth: "47%", flexGrow: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: 10, backgroundColor: colors.wizardFill },
  teamTwo: { backgroundColor: colors.cream, borderColor: colors.cream },
  teamName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  teamLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  teamTwoText: { color: colors.maroon900 },
  hcpRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hcpName: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  hcpBox: { width: 96 },
  review: { paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  reviewLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  reviewValue: { marginTop: 2, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.cream },
  textButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  textButtonText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.gold, textDecorationLine: "underline" },
});
