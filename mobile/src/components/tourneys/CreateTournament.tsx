import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { CodeRoundSetup } from "@/lib/platform/codeTournaments";
import type { ScoringCourse } from "@/lib/platform/personalRound";
import { TournamentInvites } from "~/components/tourneys/TournamentInvites.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { apiJson } from "~/lib/api.ts";
import { courseLine, type CourseResult } from "~/lib/courses.ts";
import { shownJoinCode } from "~/lib/play.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Round = { date: string; setup: CodeRoundSetup };
export function CreateTournament({ visible, close, onOpen }: { visible: boolean; close: () => void; onOpen: (id: string) => void }) {
  const [name, setName] = useState(""); const [scoring, setScoring] = useState<"Gross" | "Net">("Gross");
  const [plays, setPlays] = useState(true); const [handicap, setHandicap] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]); const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<CourseResult[]>([]); const [course, setCourse] = useState<ScoringCourse | null>(null);
  const [teeIndex, setTeeIndex] = useState(0); const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [attribution, setAttribution] = useState("");
  const [made, setMade] = useState<{ id: string; code: string } | null>(null); const [copyMessage, setCopyMessage] = useState("");
  useEffect(() => {
    if (!visible || course || query.trim().length < 2) { setCourses([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => { void apiJson<{ courses?: CourseResult[]; attribution?: string }>(`/api/app/courses/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.ok && Array.isArray(result.body.courses)) { setCourses(result.body.courses); setAttribution(result.body.attribution ?? ""); }
      else { setCourses([]); setError(result.ok ? "Couldn't search courses." : result.error); }
    }); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, course, visible]);
  async function select(result: CourseResult) {
    setBusy(true); setError("");
    const reply = await apiJson<{ course?: ScoringCourse }>(`/api/app/rounds/course/${encodeURIComponent(result.ref)}`);
    setBusy(false);
    if (!reply.ok || !reply.body.course || reply.body.course.custom || reply.body.course.par.length < 9) { setError(reply.ok ? "This course has no complete scorecard. Choose another." : reply.error); return; }
    setCourse(reply.body.course); setTeeIndex(0); setCourses([]);
  }
  function addRound() {
    if (!course) { setError("Choose a course with a scorecard."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) { setError("Enter a valid round date (YYYY-MM-DD)."); return; }
    const holes = course.par.length >= 18 ? 18 : 9;
    const setup: CodeRoundSetup = { course: { ref: course.ref, name: course.name, place: course.place, par: course.par.slice(0, holes), ...(course.strokeIndex && { strokeIndex: course.strokeIndex.slice(0, holes) }) }, tee: course.tees[teeIndex] ?? null };
    setRounds(old => [...old, { date, setup }]); setCourse(null); setQuery(""); setError("");
  }
  async function create() {
    const h = Number(handicap); const needsHandicap = scoring === "Net" && plays;
    if (!name.trim() || !rounds.length) { setError("Enter a name and add at least one round."); return; }
    if (needsHandicap && (!handicap.trim() || !Number.isFinite(h) || h < -10 || h > 54)) { setError("Enter a handicap index from -10 to 54."); return; }
    setBusy(true); setError("");
    const reply = await apiJson<{ id?: string; code?: string }>("/api/app/code-tournaments", { method: "POST", body: { name: name.trim(), scoring, plays, handicap: needsHandicap ? h : null, rounds } });
    setBusy(false);
    if (reply.ok && reply.body.id && reply.body.code) setMade({ id: reply.body.id, code: reply.body.code });
    else setError(reply.ok ? "Couldn't confirm the tournament was created. Check your tournament list before trying again." : `${reply.error} Check your tournament list before retrying.`);
  }
  function finish() { if (busy) return; setName(""); setScoring("Gross"); setPlays(true); setHandicap(""); setRounds([]); setQuery(""); setCourse(null); setError(""); setMade(null); setCopyMessage(""); close(); }
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={finish}><View style={styles.page}>
    <View style={styles.header}><Text style={styles.title}>{made ? "Tournament created" : "Create a Tournament"}</Text><SheetClose onPress={finish} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {made ? <><Text style={styles.text}>{name}</Text><Text style={styles.title}>{shownJoinCode(made.code)}</Text><Button label="Copy code" disabled={busy} onPress={() => { void Clipboard.setStringAsync(shownJoinCode(made.code)).then(() => setCopyMessage("Code copied."), () => setCopyMessage("Couldn't copy code.")); }} /><Button label="Share code" disabled={busy} onPress={() => { void Share.share({ message: `Join ${name} on Balata: open Tourneys and enter code ${shownJoinCode(made.code)}` }).catch(() => setCopyMessage("Couldn't share code.")); }} />{copyMessage ? <Text style={styles.text}>{copyMessage}</Text> : null}<TournamentInvites tournamentId={made.id} net={scoring === "Net"} /><Button label="Open tournament" disabled={busy} onPress={() => { const id = made.id; finish(); onOpen(id); }} /></> : <>
        <Text style={styles.text}>Tournament name</Text><TextInput accessibilityLabel="Tournament name" value={name} onChangeText={setName} maxLength={60} placeholder="Tournament name" style={styles.input} />
        <Text style={styles.text}>Scoring</Text><View style={styles.buttons}>{(["Gross", "Net"] as const).map(value => <Button key={value} label={value} selected={scoring === value} disabled={busy} onPress={() => setScoring(value)} />)}</View>
        <View style={styles.switch}><Text style={styles.text}>I'm playing</Text><Switch accessibilityLabel="I'm playing" value={plays} onValueChange={setPlays} /></View>
        {plays && scoring === "Net" && <><Text style={styles.text}>Your handicap index</Text><TextInput accessibilityLabel="Handicap index" value={handicap} onChangeText={setHandicap} keyboardType="numbers-and-punctuation" placeholder="e.g. 12.3" style={styles.input} /></>}
        <Text style={styles.heading}>Rounds</Text>{rounds.map((r, i) => <View style={styles.switch} key={i}><Text style={styles.text}>Round {i + 1} · {r.setup.course.name} · {r.date}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Remove round ${i + 1}`} onPress={() => setRounds(old => old.filter((_, j) => j !== i))}><Text style={styles.link}>Remove</Text></Pressable></View>)}
        {!course ? <><TextInput accessibilityLabel="Search courses" value={query} onChangeText={v => { setQuery(v); setError(""); }} placeholder="Search course or city" style={styles.input} />{courses.map(c => <Pressable key={c.ref} accessibilityRole="button" onPress={() => void select(c)} style={styles.result}><Text style={styles.resultName}>{c.name}</Text><Text>{courseLine(c)}</Text></Pressable>)}{attribution ? <Text style={styles.text}>{attribution}</Text> : null}</> : <><Text style={styles.text}>{course.name} · {course.par.length >= 18 ? 18 : 9} holes</Text><Button label="Change course" disabled={busy} onPress={() => setCourse(null)} />{course.tees.map((tee, i) => <Button key={i} label={tee.name} selected={teeIndex === i} disabled={busy} onPress={() => setTeeIndex(i)} />)}<TextInput accessibilityLabel="Round date, year month day" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={styles.input} /><Button label="Add round" disabled={busy} onPress={addRound} /></>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<Button label={busy ? "Working…" : "Create tournament"} disabled={busy} onPress={() => void create()} />
      </>}
    </ScrollView></View></Modal>;
}
function Button({ label, onPress, disabled, selected }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, disabled && { opacity: 0.5 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ page: { flex: 1, padding: gutter, backgroundColor: colors.maroon900 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream }, content: { gap: 12, paddingVertical: 20 }, text: { fontFamily: fonts.regular, fontSize: 16, color: colors.cream }, heading: { fontFamily: fonts.bold, fontSize: 19, color: colors.avatarGold }, input: { backgroundColor: colors.white, borderRadius: 12, padding: 13, fontSize: 16, color: colors.maroon900 }, buttons: { flexDirection: "row", gap: 10 }, button: { borderColor: colors.avatarGold, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center" }, selected: { backgroundColor: colors.maroon700 }, switch: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, link: { color: colors.avatarGold, fontFamily: fonts.bold }, result: { backgroundColor: colors.white, padding: 12, borderRadius: 12 }, resultName: { fontFamily: fonts.bold, color: colors.maroon900 }, error: { color: colors.errorOnMaroon, fontFamily: fonts.regular, fontSize: 15 } });
