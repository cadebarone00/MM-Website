import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { WINNER_METHODS, checkDraft, emptyDraft, formatsFor, importSummary, isMatchRound, ownBall, playersPerSide,
  type DraftStep, type ImportSummary, type PastFormat, type PastTripKind, type TripDraft, type WinnerMethod } from "@/lib/platform/pastTripModel";
import { apiRaw } from "~/lib/api.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Step = DraftStep | "review";
const STEP_LABELS: Record<Step, string> = { kind: "Kind", basics: "Basics", rounds: "Rounds", players: "Players", matches: "Matches", scores: "Scores", review: "Review" };
const KINDS: { kind: PastTripKind; label: string; about: string }[] = [
  { kind: "individual", label: "Individual", about: "Everyone plays for themselves." },
  { kind: "team", label: "Team", about: "Two teams play matches." },
  { kind: "both", label: "Both", about: "Team matches plus an individual champion." },
];
const FORMAT_LABEL: Record<PastFormat, string> = { Fourball: "Fourball (best ball)", Singles: "Singles", "Alternate Shot": "Alternate Shot", Chapman: "Chapman", Scramble: "Scramble", Shamble: "Shamble", "Stroke Play": "Stroke Play", Stableford: "Stableford" };
const STORAGE = "maroon.pastTripDraft.v1";
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const dayBefore = (s: string) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() - 1); return iso(d); };
const newId = () => Crypto.randomUUID().slice(0, 12);
const numberOrNull = (v: string) => v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v);
const dayLabel = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const tripDays = (start: string, end: string) => { const days: string[] = []; if (!start || !end || end < start) return days; for (let d = start; d <= end && days.length < 31; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) days.push(d); return days; };
function stepsFor(draft: TripDraft): Step[] {
  const kind = draft.kind;
  const hasMatches = !!kind && draft.rounds.some((r) => r.format && isMatchRound(kind, r.format));
  const hasScores = !!kind && kind !== "team" && draft.rounds.some((r) => r.format && ownBall(r.format));
  return ["kind", "basics", "rounds", "players", ...(hasMatches ? ["matches" as const] : []), ...(hasScores ? ["scores" as const] : []), "review"];
}

/**
 * Golf Trips → Import past trip in the app (website ImportWalkthrough, project_specs.md Golf Trips part 2g slice 3): the
 * same seven short steps — kind, basics, rounds, players, matches, scores, review — then Add trip. The same checks as the
 * website and server (`checkDraft`, `importSummary`) run on every step; the server checks again and saves it through
 * /api/golf-trips/import. The draft is kept on this phone, so leaving and coming back picks up where you were. (The
 * spreadsheet upload stays on the website.)
 */
export default function ImportTrip() {
  useLightStatusBar();
  const [draft, setDraft] = useState<TripDraft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>("kind");
  const [tried, setTried] = useState<Partial<Record<Step, boolean>>>({});
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [me, setMe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void AsyncStorage.getItem(STORAGE).then((saved) => { if (saved) { try { const d = { ...emptyDraft(), ...JSON.parse(saved) } as TripDraft; setDraft(d); if (d.kind) setStep("basics"); } catch { /* start fresh */ } } setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) void AsyncStorage.setItem(STORAGE, JSON.stringify(draft)).catch(() => {}); }, [draft, loaded]);
  const update = (change: (d: TripDraft) => void) => setDraft((d) => { const next = JSON.parse(JSON.stringify(d)) as TripDraft; change(next); return next; });
  const steps = stepsFor(draft);
  const at = Math.max(0, steps.indexOf(step));
  const checked = useMemo(() => checkDraft(draft, today()), [draft]);
  const problemsFor = (s: Step) => checked.problems.filter((p) => p.step === s);
  const go = (s: Step) => { setError(""); setStep(s); if (s === "review" && checked.trip) setSummary(importSummary(checked.trip)); };
  const next = () => { if (step !== "review" && problemsFor(step).length) { setTried((t) => ({ ...t, [step]: true })); return; } go(steps[Math.min(steps.length - 1, at + 1)]); };
  const startOver = () => Alert.alert("Start over?", "Everything you've entered for this trip is cleared.", [{ text: "Keep going", style: "cancel" }, { text: "Start over", style: "destructive", onPress: () => { setDraft(emptyDraft()); setTried({}); setSummary(null); setMe(""); go("kind"); } }]);
  const addTrip = async () => {
    setBusy(true); setError("");
    const r = await apiRaw<{ ok?: boolean; tripId?: string; error?: string; draftProblems?: { message: string }[] }>("/api/golf-trips/import", { method: "POST", body: { action: "create", draft, me, requestId: Crypto.randomUUID() } });
    setBusy(false);
    if ((r.status === 200 || r.status === 201) && r.body?.ok && r.body.tripId) { await AsyncStorage.removeItem(STORAGE).catch(() => {}); router.replace({ pathname: "/trips/[id]", params: { id: r.body.tripId, name: draft.name } }); return; }
    setError(r.status === 0 ? "We couldn't reach the server. Check your connection and try again." : r.body?.draftProblems?.[0]?.message ?? r.body?.error ?? "We couldn't save the trip. Try again.");
  };
  const kind = draft.kind, team = kind !== null && kind !== "individual";
  const days = tripDays(draft.startDate, draft.endDate);
  const named = draft.players.filter((p) => p.name.trim());
  const shown = tried[step] ? problemsFor(step) : [];

  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => at > 0 ? go(steps[at - 1]) : router.back()} style={styles.topButton}><Text style={styles.link}>‹ {at > 0 ? "Back" : "Golf Trips"}</Text></Pressable>
        <Text style={styles.count}>Step {at + 1} of {steps.length}</Text>
        <Pressable accessibilityRole="button" onPress={startOver} style={styles.topButton}><Text style={styles.link}>Start over</Text></Pressable>
      </View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${((at + 1) / steps.length) * 100}%` }]} /></View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{step === "kind" ? "What kind of trip was it?" : STEP_LABELS[step]}</Text>

          {step === "kind" && KINDS.map((k) => <Pressable key={k.kind} accessibilityRole="radio" accessibilityState={{ checked: draft.kind === k.kind }}
            onPress={() => { update((d) => { d.kind = k.kind; if (k.kind === "individual") d.matches = []; }); go("basics"); }} style={[styles.card, draft.kind === k.kind && styles.cardOn]}>
            <Text style={styles.cardTitle}>{k.label}</Text><Text style={styles.muted}>{k.about}</Text></Pressable>)}

          {step === "basics" && <>
            <Field label="Trip name" value={draft.name} placeholder="Spring Golf Trip" onChange={(v) => update((d) => { d.name = v; })} />
            <Field label="Where" value={draft.place} placeholder="Pinehurst, NC" onChange={(v) => update((d) => { d.place = v; })} />
            <DateRow label="Start date" value={draft.startDate} max={dayBefore(today())} onChange={(v) => update((d) => { d.startDate = v; if (!d.endDate || d.endDate < v) d.endDate = v; })} />
            <DateRow label="End date" value={draft.endDate} min={draft.startDate || undefined} max={dayBefore(today())} onChange={(v) => update((d) => { d.endDate = v; })} />
            {kind !== "team" && <><Text style={styles.label}>Individual winner decided by</Text>
              <Chips items={WINNER_METHODS.map((m) => [m, m] as [string, string])} value={draft.method ?? ""} onChange={(m) => update((d) => { d.method = m as WinnerMethod; })} /></>}
          </>}

          {step === "rounds" && kind && <>
            {draft.rounds.map((r, i) => <View key={r.number} style={styles.card}>
              <View style={styles.cardHead}><Text style={styles.cardTitle}>Round {r.number}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove round ${r.number}`} onPress={() => update((d) => { d.rounds.splice(i, 1); d.matches = d.matches.filter((m) => m.round !== r.number); d.scores = d.scores.filter((s) => s.round !== r.number); })}><Text style={styles.bad}>Remove</Text></Pressable></View>
              <Text style={styles.label}>Date</Text>
              <Chips items={[["", "Not sure"], ...days.map((day) => [day, dayLabel(day)] as [string, string])]} value={r.date ?? ""} onChange={(v) => update((d) => { d.rounds[i].date = v || null; })} />
              <Field label="Course" value={r.course} placeholder="Course name" onChange={(v) => update((d) => { d.rounds[i].course = v; })} />
              <Text style={styles.label}>Format</Text>
              <Chips items={formatsFor(kind).map((f) => [f, FORMAT_LABEL[f]] as [string, string])} value={r.format ?? ""} onChange={(f) => update((d) => { d.rounds[i].format = f as PastFormat; })} />
              {kind !== "team" && <Field label="Par" value={r.par === null ? "" : String(r.par)} placeholder="72" number onChange={(v) => update((d) => { d.rounds[i].par = numberOrNull(v); })} />}
              {kind !== "team" && r.format && ownBall(r.format) && <HolePars label={`Round ${r.number}`} pars={r.holePars ?? null}
                onChange={(pars) => update((d) => { d.rounds[i].holePars = pars; const known = pars.filter((x): x is number => x !== null); if (known.length === 18) d.rounds[i].par = known.reduce((a, b) => a + b, 0); })} />}
            </View>)}
            <Pressable accessibilityRole="button" onPress={() => update((d) => { const n = Math.max(0, ...d.rounds.map((x) => x.number)) + 1; const last = d.rounds.at(-1); d.rounds.push({ number: n, date: null, course: last?.course ?? "", format: last?.format ?? null, par: last?.par ?? null }); })} style={styles.add}><Text style={styles.addText}>+ Add round</Text></Pressable>
          </>}

          {step === "players" && <>
            {team && [0, 1].map((t) => <Field key={t} label={`Team ${t + 1} name`} value={draft.teamNames[t]} placeholder={t ? "Palms" : "Pines"} onChange={(v) => update((d) => { d.teamNames[t] = v; })} />)}
            {draft.players.map((p, i) => <View key={p.id} style={styles.card}>
              <View style={styles.cardHead}><Text style={styles.cardTitle}>Player {i + 1}</Text>
                <Pressable accessibilityRole="button" onPress={() => update((d) => { d.players.splice(i, 1); d.matches.forEach((m) => { m.sides = [m.sides[0].filter((x) => x !== p.id), m.sides[1].filter((x) => x !== p.id)]; }); d.scores = d.scores.filter((s) => s.player !== p.id); })}><Text style={styles.bad}>Remove</Text></Pressable></View>
              <Field label="Name" value={p.name} placeholder={`Player ${i + 1}`} onChange={(v) => update((d) => { d.players[i].name = v; })} />
              <Field label="Handicap (optional; +2 for a plus)" value={p.handicap === null ? "" : String(p.handicap)} placeholder="HCP" onChange={(v) => update((d) => { d.players[i].handicap = numberOrNull(v.replace(/^\+/, "-")); })} />
              {team && <Chips items={[[0, draft.teamNames[0].trim() || "Team 1"], [1, draft.teamNames[1].trim() || "Team 2"]]} value={p.team ?? -1} onChange={(t) => update((d) => { d.players[i].team = t as 0 | 1; })} />}
            </View>)}
            <Pressable accessibilityRole="button" onPress={() => update((d) => { d.players.push({ id: newId(), name: "", handicap: null, team: null }); })} style={styles.add}><Text style={styles.addText}>+ Add player</Text></Pressable>
          </>}

          {step === "matches" && kind && draft.rounds.filter((r) => r.format && isMatchRound(kind, r.format)).map((r) => {
            const per = playersPerSide(r.format as PastFormat);
            const side = (s: 0 | 1) => named.filter((p) => !team || p.team === s);
            const label = (s: 0 | 1) => team ? draft.teamNames[s].trim() || `Team ${s + 1}` : `Player ${s + 1}`;
            return <View key={r.number} style={styles.card}>
              <Text style={styles.cardTitle}>Round {r.number} · {FORMAT_LABEL[r.format as PastFormat]}</Text>
              {draft.matches.map((m, i) => m.round !== r.number ? null : <View key={m.id} style={styles.match}>
                {([0, 1] as const).map((s) => <View key={s} style={{ gap: 6 }}>
                  <Text style={styles.label}>{label(s)}</Text>
                  {Array.from({ length: per }, (_, slot) => <Chips key={slot} items={side(s).map((p) => [p.id, p.name] as [string, string])} value={m.sides[s][slot] ?? ""}
                    onChange={(id) => update((d) => { const slots = Array.from({ length: per }, (_, k) => d.matches[i].sides[s][k] ?? ""); slots[slot] = id; d.matches[i].sides[s] = slots.filter(Boolean); })} />)}
                </View>)}
                <Text style={styles.label}>Who won</Text>
                <Chips items={([0, "halved", 1] as const).map((w) => [String(w), w === "halved" ? "Halved" : team ? label(w) : named.find((p) => p.id === m.sides[w][0])?.name ?? label(w)] as [string, string])}
                  value={m.winner === null ? "" : String(m.winner)} onChange={(w) => update((d) => { d.matches[i].winner = w === "halved" ? "halved" : (Number(w) as 0 | 1); })} />
                <Pressable accessibilityRole="button" onPress={() => update((d) => { d.matches.splice(i, 1); })}><Text style={styles.bad}>Remove match</Text></Pressable>
              </View>)}
              <Pressable accessibilityRole="button" onPress={() => update((d) => { d.matches.push({ id: newId(), round: r.number, sides: [[], []], winner: null }); })} style={styles.add}><Text style={styles.addText}>+ Add match</Text></Pressable>
            </View>;
          })}

          {step === "scores" && kind && <>
            <Text style={styles.muted}>Type each total. Tap Holes to enter a scorecard instead. Leave blank if you don't know.</Text>
            {draft.rounds.map((r) => !r.format ? null : !ownBall(r.format) ? <Text key={r.number} style={styles.muted}>Round {r.number}: no individual scores in {r.format}.</Text>
              : <ScoreRound key={r.number} round={r.number} format={r.format} par={r.par} players={named} draft={draft} update={update} />)}
          </>}

          {step === "review" && (checked.problems.length > 0 ? <>
            <Text style={styles.muted}>A few things to fix first:</Text>
            {checked.problems.map((p, i) => <Pressable key={i} accessibilityRole="button" onPress={() => { setTried((t) => ({ ...t, [p.step]: true })); go(p.step); }} style={styles.problem}>
              <Text style={styles.problemText}>{p.message}</Text><Text style={styles.link}>Fix</Text></Pressable>)}
          </> : summary && <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{summary.name}</Text><Text style={styles.muted}>{summary.place}</Text>
              <Fact label="Players" value={String(summary.players.length)} /><Fact label="Rounds" value={String(summary.roundCount)} />
              {summary.teams && <Fact label={`${summary.teams.names[0]} – ${summary.teams.names[1]}`} value={`${summary.teams.points[0]} – ${summary.teams.points[1]}`} />}
              {summary.teams && <Fact label="Team winner" value={summary.teams.winner ?? "No matches"} />}
              {summary.champion && <Fact label={`Champion (${summary.champion.method.toLowerCase()})`} value={summary.champion.name ?? "Tied"} />}
            </View>
            <Text style={styles.label}>Which player is you?</Text>
            <Chips items={[["", "I didn't play"], ...named.map((p) => [p.id, p.name] as [string, string])]} value={me} onChange={setMe} />
            <Text style={styles.muted}>Everyone else is added without an account. Send each of them an invite link from the trip's Settings → Players so it shows up for them too.</Text>
          </>)}

          {shown.length > 0 && <View style={styles.problems} accessibilityLabel="Fix these to continue">{shown.map((p, i) => <Text key={i} style={styles.problemText}>• {p.message}</Text>)}</View>}
          {!!error && <Text style={styles.bad} accessibilityRole="alert">{error}</Text>}
        </ScrollView>
        {step !== "kind" && <View style={styles.footer}>
          {step === "review" ? <Pressable accessibilityRole="button" disabled={busy || checked.problems.length > 0} onPress={() => void addTrip()} style={[styles.primary, (busy || checked.problems.length > 0) && styles.dim]}><Text style={styles.primaryText}>{busy ? "Adding…" : "Add trip"}</Text></Pressable>
            : <Pressable accessibilityRole="button" onPress={next} style={styles.primary}><Text style={styles.primaryText}>Next</Text></Pressable>}
        </View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ScoreRound({ round, format, par, players, draft, update }: { round: number; format: PastFormat; par: number | null; players: TripDraft["players"]; draft: TripDraft; update: (c: (d: TripDraft) => void) => void }) {
  const [holesFor, setHolesFor] = useState<string | null>(null);
  const stableford = format === "Stableford";
  const score = (id: string) => draft.scores.find((s) => s.round === round && s.player === id);
  const set = (id: string, change: (s: TripDraft["scores"][number]) => void) => update((d) => {
    let s = d.scores.find((x) => x.round === round && x.player === id);
    if (!s) { s = { round, player: id, total: null, holes: null }; d.scores.push(s); }
    change(s);
    if (s.total === null && !(s.holes ?? []).some((h) => h !== null)) d.scores = d.scores.filter((x) => x !== s);
  });
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>Round {round} · {format}{par ? ` · Par ${par}` : ""}</Text>
    {players.map((p) => {
      const s = score(p.id);
      const holeTotal = (s?.holes ?? []).reduce<number>((sum, h) => sum + (h ?? 0), 0);
      return <View key={p.id} style={{ gap: 6 }}>
        <View style={styles.scoreRow}>
          <Text style={[styles.value, { flex: 1 }]}>{p.name}</Text>
          <TextInput value={s?.total === null || s?.total === undefined ? "" : String(s.total)} placeholder={stableford ? "Pts" : holeTotal ? String(holeTotal) : "Total"} placeholderTextColor={colors.searchFaint}
            keyboardType="number-pad" style={[styles.input, styles.total]} accessibilityLabel={`${p.name} ${stableford ? "points" : "total"}`} onChangeText={(v) => set(p.id, (x) => { x.total = numberOrNull(v); })} />
          {!stableford && <Pressable accessibilityRole="button" accessibilityState={{ expanded: holesFor === p.id }} onPress={() => setHolesFor(holesFor === p.id ? null : p.id)} style={styles.small}><Text style={styles.smallText}>Holes</Text></Pressable>}
        </View>
        {holesFor === p.id && <View style={styles.holes}>
          {Array.from({ length: 18 }, (_, h) => <View key={h} style={styles.hole}>
            <Text style={styles.holeLabel}>{h + 1}</Text>
            <TextInput value={s?.holes?.[h] == null ? "" : String(s.holes[h])} keyboardType="number-pad" style={styles.holeInput} accessibilityLabel={`${p.name} hole ${h + 1}`}
              onChangeText={(v) => set(p.id, (x) => { const list = [...(x.holes ?? Array(18).fill(null))]; list[h] = numberOrNull(v); x.holes = list; })} />
          </View>)}
        </View>}
      </View>;
    })}
  </View>;
}

function HolePars({ label, pars, onChange }: { label: string; pars: (number | null)[] | null; onChange: (p: (number | null)[]) => void }) {
  const [open, setOpen] = useState(false);
  const known = (pars ?? []).filter((h) => h !== null).length;
  return <View style={{ gap: 6 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}><Text style={styles.link}>{known === 18 ? "Hole pars: all 18 set · Edit" : known ? `Hole pars: ${known} of 18 set · Edit` : "Add hole pars (for hole-by-hole stats)"}</Text></Pressable>
    {open && <View style={styles.holes}>{Array.from({ length: 18 }, (_, h) => <View key={h} style={styles.hole}>
      <Text style={styles.holeLabel}>{h + 1}</Text>
      <TextInput value={pars?.[h] == null ? "" : String(pars[h])} keyboardType="number-pad" style={styles.holeInput} accessibilityLabel={`${label} hole ${h + 1} par`}
        onChangeText={(v) => { const next = [...(pars ?? Array(18).fill(null))]; next[h] = numberOrNull(v); onChange(next); }} />
    </View>)}</View>}
  </View>;
}

function Field({ label, value, onChange, placeholder, number = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; number?: boolean }) {
  return <View style={{ gap: 4 }}><Text style={styles.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.searchFaint} keyboardType={number ? "number-pad" : "default"} maxLength={200} style={styles.input} accessibilityLabel={label} /></View>;
}
function DateRow({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const [show, setShow] = useState(false);
  const base = value ? new Date(`${value}T12:00:00`) : new Date(`${max ?? today()}T12:00:00`);
  const pick = (e: DateTimePickerEvent, d?: Date) => { if (Platform.OS !== "ios") setShow(false); if (e.type === "set" && d) onChange(iso(d)); };
  return <View style={styles.dateRow}><Text style={[styles.value, { flex: 1 }]}>{label}</Text>
    {Platform.OS === "ios" ? (value ? <DateTimePicker value={base} mode="date" display="compact" onChange={pick} minimumDate={min ? new Date(`${min}T00:00:00`) : undefined} maximumDate={max ? new Date(`${max}T23:59:00`) : undefined} themeVariant="dark" accentColor={colors.gold} accessibilityLabel={label} />
      : <Pressable accessibilityRole="button" onPress={() => onChange(iso(base))} style={styles.small}><Text style={styles.smallText}>Pick a date</Text></Pressable>)
      : <><Pressable accessibilityRole="button" onPress={() => setShow(true)} style={styles.small}><Text style={styles.smallText}>{value ? dayLabel(value) : "Pick a date"}</Text></Pressable>
        {show && <DateTimePicker value={base} mode="date" onChange={pick} minimumDate={min ? new Date(`${min}T00:00:00`) : undefined} maximumDate={max ? new Date(`${max}T23:59:00`) : undefined} />}</>}
  </View>;
}
function Chips<T extends string | number>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
  return <View style={styles.chips}>{items.map(([v, label]) => <Pressable key={String(v)} accessibilityRole="radio" accessibilityState={{ checked: value === v }} onPress={() => onChange(v)} style={[styles.chip, value === v && styles.chipOn]}>
    <Text style={[styles.chipText, value === v && styles.chipTextOn]}>{label}</Text></Pressable>)}</View>;
}
function Fact({ label, value }: { label: string; value: string }) { return <View style={styles.dateRow}><Text style={[styles.muted, { flex: 1 }]}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, minHeight: 48 },
  topButton: { minHeight: minTap, justifyContent: "center" },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardLink },
  count: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk },
  progress: { height: 3, marginHorizontal: gutter, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)" },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.goldBright },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  card: { gap: 8, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  cardOn: { borderColor: colors.goldBright },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  value: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  bad: { fontFamily: fonts.semibold, fontSize: 13, color: colors.errorOnMaroon },
  input: { minHeight: 46, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.inputOnMaroon, color: colors.cream, fontFamily: fonts.regular, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, justifyContent: "center" },
  chipOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  chipTextOn: { color: colors.maroon900 },
  add: { minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  addText: { fontFamily: fonts.bold, fontSize: 14, color: colors.goldBright },
  match: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  problem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.errorOnMaroon },
  problems: { gap: 4, padding: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.errorOnMaroon },
  problemText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.cream },
  footer: { padding: gutter },
  primary: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.maroon900 },
  dim: { opacity: 0.4 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  total: { width: 80, textAlign: "center" },
  small: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, justifyContent: "center" },
  smallText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  holes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hole: { width: 52, alignItems: "center", gap: 2 },
  holeLabel: { fontFamily: fonts.semibold, fontSize: 11, color: colors.boardGold },
  holeInput: { width: 48, height: 40, textAlign: "center", borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, color: colors.cream, fontFamily: fonts.semibold, fontSize: 15 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: minTap },
});
