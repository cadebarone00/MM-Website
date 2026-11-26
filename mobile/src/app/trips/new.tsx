import { useCallback, useEffect, useState } from "react";
import Slider from "@react-native-community/slider";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BUILT_IN_TRIP, planTripDraft } from "@/lib/content/builtInTrip";
import type { FeaturedTrip } from "@/lib/content/ribbon";
import { isCustomRef } from "@/lib/platform/golfGps/courseRefs";
import { plannedRounds, shortTripDate, tripDates, type GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { FORMAT_NAMES } from "@/lib/platform/savedTripSetup";
import { tripBuilderSetupValues } from "@/lib/platform/tripBuilderSetup";
import { clampRoundsToDates, nextStep, previousStep, TRIP_BUILDER_STEPS, type TripBuilderStep } from "@/lib/platform/tripBuilderSteps";
import { presetById } from "@/lib/platform/tripFormatPresets";
import { markSeen, QUICK_SWIPES, TOUR_SEEN_KEY, TOUR_SLIDES, hasSeen } from "@/lib/platform/tripTour";
import { Button } from "~/components/Button.tsx";
import { BalataLogo } from "~/components/BalataLogo.tsx";
import { SelectField } from "~/components/SelectField.tsx";
import { Wizard, WizardField, WizardNote } from "~/components/setup/Wizard.tsx";
import { Counter, DateRangeCalendar, DestinationField, TripChoice } from "~/components/trips/BuilderFields.tsx";
import { apiJson, apiRaw, shareUrl } from "~/lib/api.ts";
import { useAuth } from "~/lib/auth.tsx";
import { usePlayData } from "~/lib/playData.tsx";
import { takePickedCourse } from "~/lib/roundStore.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { clearTripDraft, loadSeenStore, loadTripDraft, saveTripDraft, seenStore, startTripDraft, tripDraft } from "~/lib/tripDraft.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

type Phase = { kind: "loading" } | { kind: "learn" } | { kind: "tour"; index: number } | { kind: "step"; step: TripBuilderStep }
  | { kind: "ready"; tripId: string; tripName: string } | { kind: "invite"; tripId: string; tripName: string };

const TITLES: Record<TripBuilderStep, string> = {
  basics: "What's the trip?", dates: "When are you going?", players: "Who's coming?", teams: "How do you want to compete?",
  golf: "Where are you playing?", courses: "Pick your courses", format: "What are you playing?", lodging: "Where are you staying?",
};
const SKIP: Partial<Record<TripBuilderStep, GolfTripDraft>> = {
  players: { competing: "" }, teams: { teamStructure: "" }, golf: { golfSkipped: "1", golfDays: "0" }, courses: {}, format: { formatPreset: "" }, lodging: { knowsLodging: "undecided" },
};
const TRAVEL = [{ value: "flying", label: "Flying" }, { value: "driving", label: "Driving" }, { value: "mix", label: "A mix" }] as const;
const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] as const;
const STRUCTURE = [{ value: "two-teams", label: "2 Teams" }, { value: "pairs", label: "Pairs" }, { value: "individual", label: "Every player for themselves" }] as const;
const LODGING = [{ value: "yes", label: "Yes, it's booked" }, { value: "no", label: "Not yet" }, { value: "undecided", label: "Not sure yet" }] as const;

/**
 * Create a Golf Trip (website Trip Builder; project_specs.md "Expo app Step 2", part 2b): Learn + tour the first time,
 * then the questions in the shared step order (lib/platform/tripBuilderSteps.ts), Create Trip, Your trip is ready,
 * Invite your crew. `?plan=featured` starts from the Featured trip's itinerary (On The Range → Plan this trip).
 */
export default function NewTrip() {
  useLightStatusBar();
  const { session } = useAuth();
  const account = session?.user.id ?? "";
  const params = useLocalSearchParams<{ plan?: string; tier?: string }>();
  const { trip: featured } = usePlayData();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [values, setValues] = useState<GolfTripDraft>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pickingRound, setPickingRound] = useState<number | null>(null);
  const set = (part: GolfTripDraft) => setValues((v) => ({ ...v, ...part }));

  const open = useCallback((step: TripBuilderStep) => { setValues({ ...tripDraft() }); setPhase({ kind: "step", step }); }, []);

  useEffect(() => {
    let live = true;
    void Promise.all([loadTripDraft(), loadSeenStore([TOUR_SEEN_KEY])]).then(() => {
      if (!live) return;
      if (params.plan === "featured") {
        const trip: FeaturedTrip = featured ?? BUILT_IN_TRIP;
        const tier = trip.tiers.find((t) => t.id === params.tier) ?? trip.tiers[0];
        if (tier) startTripDraft(planTripDraft(trip, tier));
      }
      if (!hasSeen(TOUR_SEEN_KEY, account, seenStore)) setPhase({ kind: "learn" });
      else open("basics");
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back from a round's course search with a pick.
  useFocusEffect(useCallback(() => {
    const picked = takePickedCourse();
    if (picked && pickingRound !== null) {
      const n = pickingRound;
      set({ [`round${n}Course`]: picked.name.slice(0, 200), [`round${n}CourseRef`]: isCustomRef(picked.ref) ? "" : picked.ref,
        [`round${n}CoursePlace`]: isCustomRef(picked.ref) ? "" : picked.place, [`round${n}CoursePar`]: picked.par == null ? "" : String(picked.par) });
      setPickingRound(null);
    }
  }, [pickingRound]));

  const seenAndStart = () => { markSeen(TOUR_SEEN_KEY, account, seenStore); open("basics"); };

  /** Next / Skip: keep the answers (website SetupStepForm.go — a changed answer makes a new trip), then the next step or Create. */
  function go(step: TripBuilderStep, answers: GolfTripDraft) {
    const merged = clampRoundsToDates({ ...tripDraft(), ...answers });
    startTripDraft(merged);
    const next = nextStep(step, merged);
    if (next === "create") void create();
    else open(next);
  }

  async function create() {
    setCreating(true);
    setCreateError(null);
    const answers = { ...tripDraft() };
    if (!answers.requestId) { answers.requestId = Crypto.randomUUID(); saveTripDraft({ requestId: answers.requestId }); }
    const reply = await apiJson<{ tripId?: string; url?: string }>("/api/golf-trips", { method: "POST", body: answers });
    if (!reply.ok || !reply.body.tripId) {
      setCreating(false);
      setCreateError(!reply.ok && reply.code === null ? "Couldn't reach the server. Check your connection and try again. Your answers are still here."
        : !reply.ok && reply.error ? reply.error : "We couldn't create your trip. Your answers are still here, so try again.");
      return;
    }
    const tripId = reply.body.tripId;
    // The competition answers go into the trip's Settings; a failure there doesn't stop the trip.
    const setup = tripBuilderSetupValues(answers);
    if (setup) await apiJson(`/api/golf-trips/${tripId}/setup`, { method: "PUT", body: { values: setup, revision: 0, writeId: Crypto.randomUUID() } });
    clearTripDraft();
    setCreating(false);
    setPhase({ kind: "ready", tripId, tripName: answers.tripName || "Golf trip" });
  }

  if (phase.kind === "loading") return <View style={styles.blank}><ActivityIndicator color={colors.goldBright} /></View>;
  if (phase.kind === "learn") {
    const intro = QUICK_SWIPES[0];
    return (
      <Intro title={intro.title} body={intro.body} primary="Learn about Golf Trips" onPrimary={() => setPhase({ kind: "tour", index: 0 })} secondary="Skip for now" onSecondary={seenAndStart} />
    );
  }
  if (phase.kind === "tour") {
    const slide = TOUR_SLIDES[phase.index];
    const last = phase.index === TOUR_SLIDES.length - 1;
    return (
      <Intro title={slide.title} body={slide.body} dots={{ count: TOUR_SLIDES.length, at: phase.index }}
        primary={last ? "Start planning" : "Next"} onPrimary={() => last ? seenAndStart() : setPhase({ kind: "tour", index: phase.index + 1 })}
        secondary="Skip" onSecondary={seenAndStart} />
    );
  }
  if (phase.kind === "ready") return <Ready onInvite={() => setPhase({ kind: "invite", tripId: phase.tripId, tripName: phase.tripName })} />;
  if (phase.kind === "invite") return <InviteCrew tripId={phase.tripId} tripName={phase.tripName} onDone={() => router.replace({ pathname: "/trips/[id]", params: { id: phase.tripId, name: phase.tripName } })} />;

  const { step } = phase;
  const draft = { ...tripDraft(), ...values };
  const dates = tripDates(draft.startDate, draft.endDate);
  const rounds = plannedRounds(draft);
  const golfDays = Math.trunc(Number(values.golfDays)) || 0;
  const maxDays = dates.length || 14;
  const complete = step === "basics" ? Boolean(values.tripName?.trim() && values.destination?.trim())
    : step === "dates" ? tripDates(values.startDate, values.endDate).length > 0
    : step === "players" ? values.competing === "yes" || values.competing === "no"
    : step === "teams" ? Boolean(values.teamStructure)
    : step === "golf" ? golfDays > 0
    : step === "format" ? Boolean(values.formatPreset)
    : step === "lodging" ? Boolean(values.knowsLodging) : true;
  const previous = previousStep(step, draft);
  const stepAnswers = (): GolfTripDraft => {
    if (step === "golf") {
      const out: GolfTripDraft = { golfSkipped: "", golfDays: String(golfDays) };
      for (let d = 1; d <= golfDays; d++) { out[`day${d}Date`] = values[`day${d}Date`] ?? dates[d - 1] ?? ""; out[`day${d}Rounds`] = values[`day${d}Rounds`] === "2" ? "2" : "1"; }
      return out;
    }
    if (step === "players") return { playerCount: values.playerCount || "4", competing: values.competing ?? "" };
    return values;
  };

  return (
    <Wizard step={TRIP_BUILDER_STEPS.indexOf(step)} steps={TRIP_BUILDER_STEPS.length} title={TITLES[step]}
      onBack={() => previous === "start" ? router.back() : open(previous)}
      nextLabel={step === "lodging" ? (creating ? "Creating your trip…" : "Create Trip") : "Next"} busy={creating}
      nextDisabled={!complete} onNext={() => go(step, stepAnswers())}>
      {step === "basics" && (
        <>
          <WizardField label="Trip Name" value={values.tripName ?? ""} onChange={(tripName) => set({ tripName })} placeholder="Maroon Masters 2027" />
          <DestinationField value={values.destination ?? ""} onChange={(destination, place) => set({ destination, destinationPlaceId: place?.placeId ?? "",
            destinationLatitude: place ? String(place.latitude) : "", destinationLongitude: place ? String(place.longitude) : "" })} />
        </>
      )}
      {step === "dates" && (
        <>
          <DateRangeCalendar start={values.startDate ?? ""} end={values.endDate ?? ""} onChange={(r) => set({ startDate: r.start ?? "", endDate: r.end ?? "" })} />
          <TripChoice question="How's everyone getting there?" options={TRAVEL} value={values.travelMode ?? ""} onChange={(travelMode) => set({ travelMode })} />
        </>
      )}
      {step === "players" && (
        <>
          <View style={styles.slider}>
            <Text style={styles.sliderLabel}>How many players?</Text>
            <Text style={styles.sliderValue}>{values.playerCount || "4"}</Text>
            <Slider minimumValue={1} maximumValue={24} step={1} value={Number(values.playerCount || 4)} onValueChange={(n) => set({ playerCount: String(n) })}
              minimumTrackTintColor={colors.gold} maximumTrackTintColor={colors.wizardTrack} thumbTintColor={colors.goldBright} accessibilityLabel="How many players" />
          </View>
          <TripChoice question="Are you all competing?" options={YES_NO} value={values.competing ?? ""} onChange={(competing) => set({ competing })} />
        </>
      )}
      {step === "teams" && <TripChoice question="Team structure" options={STRUCTURE} value={values.teamStructure ?? ""} onChange={(teamStructure) => set({ teamStructure })} />}
      {step === "golf" && (
        <>
          <Counter label="How many golf days?" value={golfDays} min={0} max={maxDays} onChange={(n) => set({ golfDays: String(n), ...(values[`day${n}Date`] ? {} : { [`day${n}Date`]: dates[n - 1] ?? "" }) })} />
          {Array.from({ length: golfDays }, (_, i) => i + 1).map((d) => (
            <View key={d} style={styles.dayRow}>
              <Text style={styles.dayName}>Day {d}</Text>
              {dates.length > 0 && (
                <View style={styles.flex}>
                  <SelectField tone="dark" label="Date" value={values[`day${d}Date`] ?? dates[d - 1] ?? null} onChange={(date) => set({ [`day${d}Date`]: date })}
                    options={dates.map((date) => ({ value: date, label: shortTripDate(date) }))} />
                </View>
              )}
              <View style={styles.circles}>
                {(["1", "2"] as const).map((count) => {
                  const on = (values[`day${d}Rounds`] === "2" ? "2" : "1") === count;
                  return (
                    <Pressable key={count} accessibilityRole="radio" accessibilityLabel={count === "1" ? "1 round" : "2 rounds"} accessibilityState={{ checked: on }}
                      onPress={() => set({ [`day${d}Rounds`]: count })} style={[styles.circle, on && styles.circleOn]}>
                      <Text style={[styles.circleText, on && styles.circleTextOn]}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}
      {step === "courses" && (
        <>
          <Text style={styles.question}>Do you know where you&apos;re playing?</Text>
          <WizardNote>Don&apos;t worry, this can be added later.</WizardNote>
          {rounds.length === 0 ? <WizardNote>No rounds planned yet. Go Back to add golf days.</WizardNote> : rounds.map((round) => {
            const name = values[`round${round.number}Course`]?.trim();
            return (
              <View key={round.number} style={styles.roundRow}>
                <View style={styles.roundMeta}>
                  <Text style={styles.roundDate}>{round.date ? shortTripDate(round.date) : `Day ${round.dayNumber}`}</Text>
                  <Text style={styles.roundNumber}>Round {round.number}</Text>
                </View>
                {name ? (
                  <View style={styles.picked}>
                    <View style={styles.flex}>
                      <Text style={styles.pickedName} numberOfLines={2}>{name}</Text>
                      <Text style={styles.pickedPlace}>{values[`round${round.number}CourseRef`] ? values[`round${round.number}CoursePlace`] : "No scorecard"}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Change round ${round.number} course`} hitSlop={10}
                      onPress={() => set({ [`round${round.number}Course`]: "", [`round${round.number}CourseRef`]: "", [`round${round.number}CoursePlace`]: "", [`round${round.number}CoursePar`]: "" })}>
                      <SymbolView name="xmark" size={14} tintColor={colors.wizardMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => { setPickingRound(round.number); router.push({ pathname: "/courses/search", params: { for: "setup" } }); }} style={styles.searchCourse}>
                    <SymbolView name="magnifyingglass" size={15} tintColor={colors.paperInkSoft} />
                    <Text style={styles.searchCourseText}>Search courses</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </>
      )}
      {step === "format" && <Formats values={values} set={set} roundCount={rounds.length} />}
      {step === "lodging" && (
        <>
          <TripChoice question="Do you know where you're staying?" options={LODGING} value={values.knowsLodging ?? ""} onChange={(knowsLodging) => set({ knowsLodging })} />
          {createError && <WizardNote tone="error">{createError}</WizardNote>}
        </>
      )}
      {SKIP[step] && !creating && (
        <Pressable accessibilityRole="button" onPress={() => go(step, SKIP[step]!)} style={styles.skip}><Text style={styles.skipText}>Skip for now</Text></Pressable>
      )}
    </Wizard>
  );
}

/** Formats (website TripFormatsStep): Balata Style, then Both · Individual · Team · Create Your Own. */
function Formats({ values, set, roundCount }: { values: GolfTripDraft; set: (part: GolfTripDraft) => void; roundCount: number }) {
  const maroon = presetById("maroon")!;
  const individual = presetById("individual")!;
  const team = presetById("team")!;
  const pick = values.formatPreset ?? "";
  const card = (id: string, label: string, blurb: string) => (
    <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: pick === id }} onPress={() => set({ formatPreset: pick === id ? "" : id })}
      style={[styles.formatCard, pick === id && styles.formatOn]}>
      <Text style={[styles.formatTitle, pick === id && styles.formatTextOn]}>{label}</Text>
      <Text style={[styles.formatBlurb, pick === id && styles.formatTextOn]}>{blurb}</Text>
    </Pressable>
  );
  return (
    <>
      <View style={styles.maroonPhoto}><BalataLogo light /></View>
      <Text style={styles.question}>Balata Style</Text>
      {maroon.tag ? <WizardNote>{maroon.tag}</WizardNote> : null}
      {card("maroon", maroon.label, maroon.blurb)}
      <View style={styles.pair}>
        <View style={styles.flex}>{card("individual", individual.label, individual.blurb)}</View>
        <View style={styles.flex}>{card("team", team.label, team.blurb)}</View>
      </View>
      {card("custom", "Create Your Own", "Mix and match a format for each round.")}
      {pick === "custom" && (roundCount === 0 ? <WizardNote>No rounds yet. You can pick formats in Settings once rounds are added.</WizardNote>
        : Array.from({ length: roundCount }, (_, i) => (
          <SelectField key={i} tone="dark" label={`Round ${i + 1}`} value={values[`round${i + 1}Format`] || "later"} onChange={(v) => set({ [`round${i + 1}Format`]: v === "later" ? "" : v })}
            options={[{ value: "later", label: "Decide later" }, ...FORMAT_NAMES.map((name) => ({ value: name, label: name }))]} />
        )))}
    </>
  );
}

/** Learn and the tour's slides (website LearnScreen / TourSlides; their phone pictures arrive with the native trip page). */
function Intro({ title, body, primary, onPrimary, secondary, onSecondary, dots }: {
  title: string; body: string; primary: string; onPrimary: () => void; secondary: string; onSecondary: () => void; dots?: { count: number; at: number };
}) {
  return (
    <SafeAreaView style={styles.intro} edges={["top", "bottom"]}>
      <View style={styles.introArt}><Text style={styles.introMark}>M</Text></View>
      <View style={styles.introCopy}>
        <Text style={styles.introTitle}>{title}</Text>
        <Text style={styles.introBody}>{body}</Text>
        {dots && <View style={styles.dots}>{Array.from({ length: dots.count }, (_, i) => <View key={i} style={[styles.dot, i === dots.at && styles.dotOn]} />)}</View>}
      </View>
      <View style={styles.introActions}>
        <Button label={primary} onPress={onPrimary} />
        <Pressable accessibilityRole="button" onPress={onSecondary} style={styles.skip}><Text style={styles.skipText}>{secondary}</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

/** "Your trip is ready" (website TripReadyScreen) → Invite your crew. */
function Ready({ onInvite }: { onInvite: () => void }) {
  return (
    <SafeAreaView style={styles.intro} edges={["top", "bottom"]}>
      <View style={styles.introArt}><Text style={[styles.introMark, styles.readyMark]}>M</Text></View>
      <View style={styles.introCopy}><Text style={styles.introTitle}>Your trip is ready</Text></View>
      <View style={styles.introActions}><Button label="Invite your crew" onPress={onInvite} /></View>
    </SafeAreaView>
  );
}

/**
 * Invite your crew (website GolfTripInviteDialog): the trip's 30-minute invite link with Copy and Share; before the
 * join-link setup it shows the trip code (Golf Trips → Join a Trip). Done opens the trip.
 */
function InviteCrew({ tripId, tripName, onDone }: { tripId: string; tripName: string; onDone: () => void }) {
  const [link, setLink] = useState<{ url: string } | null>(null);
  const [off, setOff] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    apiRaw<{ code?: string; url?: string }>(`/api/golf-trips/${tripId}/join-link`).then((reply) => {
      if (reply.status >= 200 && reply.status < 300 && reply.body?.code && reply.body.url) setLink({ url: reply.body.url.startsWith("http") ? reply.body.url : shareUrl(reply.body.url) });
      else setOff(true);
    });
  }, [tripId]);
  const shown = off ? tripId : link?.url ?? "Getting your link…";
  const text = off ? shareUrl(`/golf-trips/trip/?id=${tripId}`) : link?.url ?? "";
  return (
    <SafeAreaView style={styles.intro} edges={["top", "bottom"]}>
      <View style={styles.introCopy}>
        <Text style={styles.introTitle}>Invite your crew</Text>
        <Text style={styles.introBody}>{off ? "Send them this invite code. They paste it in Golf Trips → Join a Trip." : "Anyone with this link can join. It works for 30 minutes."}</Text>
        <View style={styles.codeBox}><Text style={styles.code} selectable numberOfLines={3}>{shown}</Text></View>
        <Text style={styles.note}>{note ?? " "}</Text>
      </View>
      <View style={styles.introActions}>
        <Button label="Copy" disabled={!text} onPress={async () => { try { await Clipboard.setStringAsync(off ? tripId : text); setNote("Copied"); } catch { setNote("Couldn't copy."); } }} />
        <Button label="Share" variant="secondaryOnDark" disabled={!text} onPress={() => { Share.share({ message: `Join ${tripName} on Balata: ${text}` }).catch(() => {}); }} />
        <Pressable accessibilityRole="button" onPress={onDone} style={styles.skip}><Text style={styles.skipText}>Done</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  blank: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.maroon900 },
  question: { fontFamily: fonts.semibold, fontSize: 20, color: colors.white },
  skip: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  skipText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.wizardMuted, textDecorationLine: "underline" },
  slider: { gap: 6, padding: 14, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  sliderLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  sliderValue: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dayName: { width: 48, fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  circles: { flexDirection: "row", gap: 6 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  circleOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  circleText: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  circleTextOn: { color: colors.maroon900 },
  roundRow: { gap: 6 },
  roundMeta: { flexDirection: "row", justifyContent: "space-between" },
  roundDate: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  roundNumber: { fontFamily: fonts.regular, fontSize: 13, color: colors.wizardMuted },
  picked: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  pickedName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  pickedPlace: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  searchCourse: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.paperBorder, backgroundColor: colors.paper },
  searchCourseText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.paperInkSoft },
  maroonPhoto: { height: 150, borderRadius: radius.card, alignItems: "center", justifyContent: "center", backgroundColor: colors.maroon700, borderWidth: 1, borderColor: colors.wizardLine },
  maroonMark: { fontFamily: fonts.bold, fontSize: 48, color: colors.goldBright },
  maroonTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  pair: { flexDirection: "row", gap: 8 },
  formatCard: { minHeight: 96, gap: 4, padding: 14, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  formatOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  formatTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  formatBlurb: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.wizardMuted },
  formatTextOn: { color: colors.maroon900 },
  intro: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: gutter, justifyContent: "space-between" },
  introArt: { flex: 1, alignItems: "center", justifyContent: "center" },
  introMark: { fontFamily: fonts.bold, fontSize: 96, color: colors.goldBright },
  readyMark: { fontSize: 120 },
  introCopy: { gap: 10, alignItems: "center", paddingVertical: 12 },
  introTitle: { textAlign: "center", fontFamily: fonts.bold, fontSize: 30, color: colors.cream },
  introBody: { textAlign: "center", fontFamily: fonts.regular, fontSize: 17, lineHeight: 24, color: colors.boardInk },
  dots: { flexDirection: "row", gap: 6, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.wizardTrack },
  dotOn: { backgroundColor: colors.gold },
  introActions: { gap: 10, paddingBottom: 12 },
  codeBox: { alignSelf: "stretch", padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  code: { textAlign: "center", fontFamily: fonts.semibold, fontSize: 15, color: colors.goldBright },
  note: { fontFamily: fonts.regular, fontSize: 14, color: colors.boardLink },
});
