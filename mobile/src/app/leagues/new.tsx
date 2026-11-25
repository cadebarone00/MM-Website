import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isCustomRef } from "@/lib/platform/golfGps/courseRefs";
import type { LeagueScoring } from "@/lib/platform/leagues";
import type { ScoringCourse } from "@/lib/platform/personalRound";
import { Button } from "~/components/Button.tsx";
import { CodeCard } from "~/components/CodeCard.tsx";
import { DateField } from "~/components/DateField.tsx";
import { PillToggle } from "~/components/PillToggle.tsx";
import { SelectField } from "~/components/SelectField.tsx";
import { Wizard, WizardChoices, WizardField, WizardNote } from "~/components/setup/Wizard.tsx";
import { apiJson } from "~/lib/api.ts";
import { dayLabel, handicapOk, handicapValue, leagueCourseFrom } from "~/lib/leaguesUi.ts";
import { takePickedCourse, type PickedCourse } from "~/lib/roundStore.ts";
import { dayDate, dayText } from "~/lib/setupHelpers.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

type CourseLoad = { status: "none" } | { status: "loading"; picked: PickedCourse } | { status: "ready"; course: ScoringCourse } | { status: "error"; message: string };

/**
 * Create a league (website LeagueCreate; part 5a): 1. course (the Play course search, 18 holes only), tees and date →
 * 2. name, Leaderboard Gross / Net, I'm playing (+ handicap) → POST /api/leagues → League created: the code card, Open league.
 * Claude's call: a course added by hand isn't offered (a league needs the course's real scorecard for net and skins).
 */
export default function NewLeague() {
  useLightStatusBar();
  const [step, setStep] = useState<0 | 1>(0);
  const [load, setLoad] = useState<CourseLoad>({ status: "none" });
  const [tee, setTee] = useState(0);
  const [date, setDate] = useState(dayText(new Date()));
  const [name, setName] = useState("");
  const [scoring, setScoring] = useState<LeagueScoring>("Gross");
  const [plays, setPlays] = useState(true);
  const [handicap, setHandicap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; code: string } | null>(null);

  const pick = useCallback(async (next: PickedCourse) => {
    setTee(0); setError(null);
    if (isCustomRef(next.ref)) { setLoad({ status: "error", message: "Leagues need a course with a scorecard. Search for the course instead." }); return; }
    setLoad({ status: "loading", picked: next });
    const r = await apiJson<{ course?: ScoringCourse }>(`/api/rounds/course/${encodeURIComponent(next.ref)}`);
    if (!r.ok || !r.body.course) { setLoad({ status: "error", message: !r.ok && r.code === "no_scorecard" ? "This course doesn't have a scorecard on file yet. Pick another course." : r.ok ? "Couldn't load this course. Try again." : r.error }); return; }
    if (r.body.course.par.length !== 18) { setLoad({ status: "error", message: "Leagues need an 18-hole course. Pick another course." }); return; }
    setLoad({ status: "ready", course: r.body.course });
  }, []);
  useFocusEffect(useCallback(() => { const next = takePickedCourse(); if (next) void pick(next); }, [pick]));
  const search = () => router.push({ pathname: "/courses/search", params: { for: "setup" } });

  const course = load.status === "ready" ? leagueCourseFrom(load.course, tee) : null;
  const ready = name.trim().length > 0 && !!course && (!plays || handicapOk(handicap));

  async function create() {
    if (!ready || !course) return;
    setBusy(true); setError(null);
    const r = await apiJson<{ id?: string; code?: string }>("/api/leagues", { method: "POST", body: { name: name.trim(), course, date, scoring, plays, handicap: plays ? handicapValue(handicap) : null } });
    setBusy(false);
    if (r.ok && r.body.id && r.body.code) { setMade({ id: r.body.id, code: r.body.code }); return; }
    setError(r.ok ? "Couldn't create the league. Try again." : r.error);
  }

  if (made) {
    return (
      <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.ready}>
          <Text style={styles.kicker}>LEAGUE CREATED</Text>
          <Text style={styles.title} accessibilityRole="header">{name.trim()}</Text>
          <CodeCard kind="league" code={made.code} name={name.trim()} />
          <Button label="Open league" onPress={() => router.replace({ pathname: "/leagues/[id]", params: { id: made.id } })} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 0) {
    return (
      <Wizard step={0} steps={2} title="Where are you playing?" backLabel="Cancel" onBack={() => router.back()} nextLabel="Next" onNext={() => setStep(1)} nextDisabled={!course}>
        <Pressable accessibilityRole="button" accessibilityLabel={load.status === "ready" ? `Course: ${load.course.name}. Change` : "Search for a course"} onPress={search} style={styles.course}>
          <SymbolView name={load.status === "ready" ? "flag.fill" : "magnifyingglass"} size={18} tintColor={colors.goldBright} />
          <View style={styles.courseText}>
            <Text style={styles.courseName} numberOfLines={1}>{load.status === "ready" ? load.course.name : load.status === "loading" ? load.picked.name : "Search for a course"}</Text>
            {load.status === "ready" && load.course.place ? <Text style={styles.coursePlace} numberOfLines={1}>{load.course.place}</Text> : null}
          </View>
          {load.status === "loading" ? <ActivityIndicator color={colors.goldBright} /> : <Text style={styles.change}>{load.status === "ready" ? "Change" : ""}</Text>}
        </Pressable>
        {load.status === "error" && <WizardNote tone="error">{load.message}</WizardNote>}
        {load.status === "ready" && (load.course.tees.length ? (
          <SelectField tone="dark" label="Tees" value={String(tee)} onChange={(value) => setTee(Number(value))}
            options={load.course.tees.map((t, i) => ({ value: String(i), label: t.name, detail: t.rating != null && t.slope != null ? `${t.rating} / ${t.slope}` : "No rating" }))} />
        ) : <WizardNote>No tees listed for this course.</WizardNote>)}
        <DateField tone="dark" label="Date" value={dayDate(date)} minimumDate={new Date()} onChange={(d) => setDate(dayText(d))} />
      </Wizard>
    );
  }

  return (
    <Wizard step={1} steps={2} title="Create a league" onBack={() => setStep(0)} nextLabel={busy ? "Creating…" : "Create league"} onNext={() => void create()} nextDisabled={!ready} busy={busy}>
      <WizardField label="League name" value={name} onChange={setName} placeholder="e.g. Thursday Night League" maxLength={60} />
      <WizardNote>{`${load.status === "ready" ? load.course.name : ""} · ${dayLabel(date)}${course?.tee ? ` · ${course.tee.name} tees` : ""}`}</WizardNote>
      <WizardChoices label="Leaderboard" value={scoring} options={[["Gross", "Gross"], ["Net", "Net"]]} onChange={setScoring} />
      <WizardNote>{`${scoring === "Net" ? "Each player's handicap strokes come off on the hardest holes first." : "Raw strokes, no handicaps."} You can change it later.`}</WizardNote>
      <PillToggle tone="dark" label="I'm playing" note={plays ? "You'll be on the leaderboard" : "You'll run it, but won't play"} value={plays} onChange={setPlays} />
      {plays && (
        <>
          <WizardField label="Your handicap index" value={handicap} onChange={setHandicap} placeholder="e.g. 8.4" keyboard="numbers-and-punctuation" maxLength={5} />
          <WizardNote tone={handicapOk(handicap) ? "plain" : "error"}>{handicapOk(handicap) ? "Used for anything net: the leaderboard, skins, pairs and group games." : "Enter a handicap from -10 to 54, or leave it blank."}</WizardNote>
        </>
      )}
      {error && <WizardNote tone="error">{error}</WizardNote>}
    </Wizard>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  ready: { gap: 16, paddingHorizontal: gutter, paddingTop: 32, paddingBottom: 40 },
  kicker: { fontFamily: fonts.capsBold, fontSize: 12, letterSpacing: 1.2, color: colors.gold },
  title: { fontFamily: fonts.bold, fontSize: 30, color: colors.cream },
  course: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  courseText: { flex: 1, minWidth: 0 },
  courseName: { fontFamily: fonts.semibold, fontSize: 17, color: colors.cream },
  coursePlace: { fontFamily: fonts.regular, fontSize: 13, color: colors.wizardMuted },
  change: { fontFamily: fonts.semibold, fontSize: 14, color: colors.goldBright },
});
