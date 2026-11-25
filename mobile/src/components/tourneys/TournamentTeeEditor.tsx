import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { DEFAULT_TIMING, randomTeeSheet, roundTeeSheet, scoreTeeSheet, teeSlot, type CodeTournament, type TeeSheet, type TeeStart, type TeeTiming } from "@/lib/platform/codeTournaments";
import { apiJson } from "~/lib/api.ts";
import { saveTournamentTeeSheet } from "~/lib/tournamentTeeSave.ts";
import { colors, fonts } from "~/lib/theme.ts";

/** Organizer can move players between groups and edit start times and holes. Server remains authoritative. */
export function TournamentTeeEditor({ tournament, reload }: { tournament: CodeTournament; reload: () => Promise<boolean> }) {
  const [round, setRound] = useState(tournament.rounds[0]?.number ?? 1);
  const [draft, setDraft] = useState<TeeSheet>(() => roundTeeSheet(tournament, tournament.rounds[0]?.number ?? 1));
  const [baseline, setBaseline] = useState(() => JSON.stringify(roundTeeSheet(tournament, tournament.rounds[0]?.number ?? 1)));
  const [needsRefresh, setNeedsRefresh] = useState(false); const [mustReopen, setMustReopen] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [first, setFirst] = useState(tournament.rounds[0]?.teeSheet?.groups[0]?.time || DEFAULT_TIMING.first);
  const [every, setEvery] = useState(String(DEFAULT_TIMING.every)); const [start, setStart] = useState<TeeStart>("1");
  const holes = tournament.rounds.find(r => r.number === round)?.setup.course.par.length ?? 18;
  const ids = draft.groups.flatMap(group => group.players);
  const validTiming = /^([01]\d|2[0-3]):[0-5]\d$/.test(first) && /^\d+$/.test(every) && Number(every) >= 1 && Number(every) <= 60;
  const timing: TeeTiming = { first, every: Number(every), start };
  const byScore = validTiming ? scoreTeeSheet(tournament, round, ids, timing, holes) : null;
  function choose(n: number) { if (needsRefresh) return; const sheet = roundTeeSheet(tournament, n); setRound(n); setDraft(sheet); setBaseline(JSON.stringify(sheet)); setMustReopen(false); setFirst(sheet.groups[0]?.time || DEFAULT_TIMING.first); setEvery(String(DEFAULT_TIMING.every)); setStart("1"); setMessage(""); }
  function retime() { if (!validTiming) { setMessage("Enter a valid 24-hour first tee time and an interval of 1 to 60 minutes."); return; } setDraft(old => ({ groups: old.groups.map((group, i) => ({ ...group, ...teeSlot(i, timing, holes) })) })); setMessage("Tee times updated. Save to apply them."); }
  function move(id: string, from: number, to: number) {
    setDraft(old => { const groups = old.groups.map(g => ({ ...g, players: [...g.players] })); if (!groups[to] || groups[to].players.length >= 6) return old; groups[from].players = groups[from].players.filter(p => p !== id); groups[to].players.push(id); return { groups: groups.filter(g => g.players.length) }; });
  }
  function addGroup(id: string, from: number) {
    setDraft(old => { const groups = old.groups.map(g => ({ ...g, players: [...g.players] })); groups[from].players = groups[from].players.filter(p => p !== id); groups.push({ time: "", hole: 1, players: [id] }); return { groups: groups.filter(g => g.players.length) }; });
  }
  async function save() {
    if (busy || needsRefresh || mustReopen) return;
    const currentSheet = roundTeeSheet(tournament, round);
    if (JSON.stringify(currentSheet) !== baseline) { setMessage("The saved tee sheet changed. Reopen this round and review it before saving."); return; }
    const currentPlayers = currentSheet.groups.flatMap(group => group.players).sort();
    const draftPlayers = draft.groups.flatMap(group => group.players).sort();
    if (currentPlayers.length !== draftPlayers.length || currentPlayers.some((id, i) => id !== draftPlayers[i])) { setMessage("The player list changed. Reopen this round before saving the tee sheet."); return; }
    if (draft.groups.some(g => !/^(([01]\d|2[0-3]):[0-5]\d)?$/.test(g.time) || !Number.isInteger(g.hole) || g.hole < 1 || g.hole > holes || !g.players.length || g.players.length > 6)) { setMessage("Use a 24-hour tee time (HH:MM) and starting holes 1–18."); return; }
    setBusy(true); setMessage("");
    const outcome = await saveTournamentTeeSheet(async () => {
      const reply = await apiJson<Record<string, unknown>>(`/api/app/code-tournaments/${encodeURIComponent(tournament.id)}`, { method: "POST", body: { action: "teeSheet", round, teeSheet: draft } });
      return reply.ok ? { ok: true } : { ok: false, error: reply.error };
    }, reload);
    if (outcome.saved && !outcome.needsRefresh) setBaseline(JSON.stringify(draft));
    setNeedsRefresh(outcome.needsRefresh); setMessage(outcome.message);
    setBusy(false);
  }
  async function refreshSheet() {
    setBusy(true);
    const refreshed = await reload().catch(() => false);
    setNeedsRefresh(!refreshed); setMustReopen(refreshed);
    setMessage(refreshed ? "Select the round to load its latest tee sheet. Your current draft will be replaced." : "Could not refresh the tee sheet. Try again when connected.");
    setBusy(false);
  }
  return <View style={styles.panel}><Text style={styles.heading}>Edit tee sheet</Text>{needsRefresh && <Button label="Refresh tee sheet" disabled={busy} onPress={() => void refreshSheet()} />}<View style={styles.row}>{tournament.rounds.map(r => <Button key={r.number} label={`Round ${r.number}`} disabled={busy || needsRefresh} onPress={() => choose(r.number)} />)}</View>
    {draft.groups.length > 0 && tournament.status === "live" && <><Text style={styles.text}>Timing and pairings</Text><View style={styles.row}><TextInput accessibilityLabel="First tee time, 24 hour" value={first} onChangeText={setFirst} placeholder="HH:MM" maxLength={5} style={styles.input} /><TextInput accessibilityLabel="Minutes between groups" value={every} onChangeText={setEvery} keyboardType="number-pad" placeholder="Minutes" maxLength={2} style={styles.input} /></View><View style={styles.row}>{(["1", ...(holes >= 18 ? ["1&10" as const] : []), "shotgun"] as TeeStart[]).map(option => <Button key={option} label={option === "shotgun" ? "Shotgun" : `Start on ${option}`} disabled={busy} onPress={() => setStart(option)} />)}</View><Text style={styles.text}>Selected start: {start === "shotgun" ? "Shotgun" : start}</Text><View style={styles.row}><Button label="Apply timing" disabled={busy} onPress={retime} /><Button label="Randomize pairings" disabled={busy || !validTiming} onPress={() => { setDraft(randomTeeSheet(ids, timing, holes)); setMessage("Pairings updated. Save to apply them."); }} /><Button label="Pair by score" disabled={busy || !byScore} onPress={() => { if (byScore) { setDraft(byScore); setMessage("Pairings updated. Save to apply them."); } }} /></View><Text style={styles.text}>Changing groups changes who attests each scorecard.</Text></>}
    {draft.groups.length === 0 ? <Text style={styles.text}>No players yet.</Text> : draft.groups.map((g, i) => <View style={styles.group} key={i}><Text style={styles.heading}>Group {i + 1}</Text><View style={styles.row}><TextInput accessibilityLabel={`Group ${i + 1} tee time`} value={g.time} onChangeText={value => setDraft(old => ({ groups: old.groups.map((x, j) => j === i ? { ...x, time: value } : x) }))} placeholder="HH:MM" maxLength={5} style={styles.input} /><TextInput accessibilityLabel={`Group ${i + 1} starting hole`} value={String(g.hole)} onChangeText={value => setDraft(old => ({ groups: old.groups.map((x, j) => j === i ? { ...x, hole: Number(value) } : x) }))} keyboardType="number-pad" style={styles.input} /></View>
      {g.players.map(id => <View key={id} style={styles.group}><Text style={styles.text}>{tournament.players.find(p => p.profileId === id)?.name ?? "Player"}</Text><View style={styles.row}>{i > 0 && <Button label="Previous group" disabled={busy || draft.groups[i - 1].players.length >= 6} onPress={() => move(id, i, i - 1)} />}{i < draft.groups.length - 1 && <Button label="Next group" disabled={busy || draft.groups[i + 1].players.length >= 6} onPress={() => move(id, i, i + 1)} />}{g.players.length > 1 && <Button label="New group" disabled={busy} onPress={() => addGroup(id, i)} />}</View></View>)}
    </View>)}
    {!!draft.groups.length && <Button label="Save tee sheet" disabled={busy || needsRefresh || mustReopen || tournament.status !== "live"} onPress={() => void save()} />}{message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
  </View>;
}
function Button({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ panel: { gap: 12, paddingVertical: 12 }, heading: { fontFamily: fonts.bold, color: colors.avatarGold, fontSize: 17 }, text: { fontFamily: fonts.regular, color: colors.cream, fontSize: 15 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, group: { gap: 8, paddingVertical: 6 }, button: { borderWidth: 1, borderColor: colors.avatarGold, borderRadius: 10, padding: 9 }, input: { minWidth: 75, color: colors.maroon900, backgroundColor: colors.white, borderRadius: 8, padding: 8 } });
