import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { CodeRoundSetup, CodeTournament } from "@/lib/platform/codeTournaments";
import type { ScoringCourse } from "@/lib/platform/personalRound";
import { apiJson } from "~/lib/api.ts";
import { courseLine, type CourseResult } from "~/lib/courses.ts";
import { addTournamentRound } from "~/lib/tournamentAddRoundSave.ts";
import { colors, fonts } from "~/lib/theme.ts";

/** Add a round using the existing course search, scorecard and organizer-only tournament handler. */
export function TournamentAddRound({ tournament, reload }: { tournament: CodeTournament; reload: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]); const [attribution, setAttribution] = useState("");
  const [course, setCourse] = useState<ScoringCourse | null>(null); const [tee, setTee] = useState(0);
  const lastDate = tournament.rounds.at(-1)?.date ?? "";
  const [date, setDate] = useState(() => { const today = new Date().toLocaleDateString("en-CA"); return lastDate > today ? lastDate : today; });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false); const [mustReview, setMustReview] = useState(false); const [confirmedSaved, setConfirmedSaved] = useState(false);
  useEffect(() => {
    if (!open || course || query.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => { void apiJson<{ courses?: CourseResult[]; attribution?: string }>(`/api/app/courses/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.ok && Array.isArray(result.body.courses)) { setResults(result.body.courses); setAttribution(result.body.attribution ?? ""); }
      else { setResults([]); setError(result.ok ? "Couldn't search courses." : result.error); }
    }); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, course]);
  async function select(c: CourseResult) {
    setBusy(true); setError(""); const result = await apiJson<{ course?: ScoringCourse }>(`/api/app/rounds/course/${encodeURIComponent(c.ref)}`); setBusy(false);
    if (!result.ok || !result.body.course || result.body.course.custom || result.body.course.par.length < 9) { setError(result.ok ? "This course has no complete scorecard. Choose another." : result.error); return; }
    setCourse(result.body.course); setTee(0); setResults([]);
  }
  async function save() {
    if (!course || busy || needsRefresh || mustReview) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || (lastDate && date < lastDate)) { setError(`Enter a valid date on or after ${lastDate || "today"}.`); return; }
    const holes = course.par.length >= 18 ? 18 : 9;
    const setup: CodeRoundSetup = { course: { ref: course.ref, name: course.name, place: course.place, par: course.par.slice(0, holes), ...(course.strokeIndex && { strokeIndex: course.strokeIndex.slice(0, holes) }) }, tee: course.tees[tee] ?? null };
    setBusy(true); setError("");
    const outcome = await addTournamentRound(async () => {
      const result = await apiJson<{ number?: number }>(`/api/app/code-tournaments/${encodeURIComponent(tournament.id)}`, { method: "POST", body: { action: "addRound", setup, date } });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }, reload);
    setConfirmedSaved(outcome.saved); setNeedsRefresh(outcome.needsRefresh);
    if (outcome.saved && !outcome.needsRefresh) { setOpen(false); setCourse(null); setQuery(""); setError(""); }
    else setError(outcome.message);
    setBusy(false);
  }
  async function refreshRounds() {
    setBusy(true); const refreshed = await reload().catch(() => false);
    setNeedsRefresh(!refreshed); setMustReview(refreshed);
    setError(refreshed ? "Review the current rounds below before continuing." : "Could not refresh the tournament. Try again when connected.");
    setBusy(false);
  }
  if ((tournament.status !== "live" || tournament.rounds.length >= 10) && !needsRefresh && !mustReview) return null;
  return <View style={styles.panel}><Button label={open ? "Cancel adding round" : "Add round"} disabled={busy} onPress={() => { setOpen(!open); setCourse(null); setQuery(""); setError(""); }} />
    {open && <>{needsRefresh && <Button label="Refresh rounds" disabled={busy} onPress={() => void refreshRounds()} />}{mustReview && <><Text style={styles.text}>Current rounds:</Text>{tournament.rounds.map(r => <Text key={r.number} style={styles.text}>Round {r.number}: {r.setup.course.name} · {r.date}</Text>)}<Button label="Discard draft and finish" disabled={busy} onPress={() => { setOpen(false); setCourse(null); setQuery(""); setMustReview(false); setConfirmedSaved(false); setError(""); }} />{!confirmedSaved && tournament.status === "live" && tournament.rounds.length < 10 && <Button label="I reviewed the rounds; continue editing" disabled={busy} onPress={() => { setMustReview(false); setError("Check the course and date before adding the round."); }} />}</>}{!course ? <><TextInput accessibilityLabel="Search for a course" value={query} onChangeText={v => { setQuery(v); setError(""); }} placeholder="Search course or city" style={styles.input} />{results.map(c => <Pressable accessibilityRole="button" disabled={busy} key={c.ref} onPress={() => void select(c)} style={styles.result}><Text style={styles.name}>{c.name}</Text><Text>{courseLine(c)}</Text></Pressable>)}{attribution ? <Text style={styles.text}>{attribution}</Text> : null}</> : <><Text style={styles.text}>{course.name} · {course.par.length >= 18 ? 18 : 9} holes</Text><Button label="Change course" disabled={busy || needsRefresh || mustReview} onPress={() => setCourse(null)} />{course.tees.map((t, i) => <Button key={i} label={t.name} selected={tee === i} disabled={busy || needsRefresh || mustReview} onPress={() => setTee(i)} />)}<Text style={styles.text}>Round date</Text><TextInput accessibilityLabel="Round date, year month day" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={styles.input} /><Button label={busy ? "Saving…" : "Add round"} disabled={busy || needsRefresh || mustReview || tournament.status !== "live" || tournament.rounds.length >= 10} onPress={() => void save()} /></>}{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</>}
  </View>;
}
function Button({ label, disabled, selected, onPress }: { label: string; disabled: boolean; selected?: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: !!selected }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selected, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ panel: { gap: 10, paddingVertical: 10 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, error: { fontFamily: fonts.regular, color: colors.errorOnMaroon, fontSize: 15 }, button: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10, padding: 10 }, selected: { backgroundColor: colors.maroon700 }, input: { backgroundColor: colors.white, color: colors.maroon900, borderRadius: 10, padding: 12 }, result: { backgroundColor: colors.white, borderRadius: 10, padding: 12 }, name: { color: colors.maroon900, fontFamily: fonts.bold } });
