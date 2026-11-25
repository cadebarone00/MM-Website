import { useState, type ReactNode } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TeeTiming } from "@/lib/platform/codeTournaments";
import { drawPairs, makeTeeTimes, PAIR_FORMATS, PAIR_RULES, SEGMENT_OPTIONS, ungrouped, type League, type LeagueScoring, type PairFormat, type PairRule, type PairSegments } from "@/lib/platform/leagues";
import { LIVE_VISIBILITIES, LIVE_VISIBILITY_COPY, liveSettingsFrom, type LiveSettings } from "@/lib/platform/liveVisibility";
import { Button } from "~/components/Button.tsx";
import { CodeCard } from "~/components/CodeCard.tsx";
import { DateField } from "~/components/DateField.tsx";
import { SelectField } from "~/components/SelectField.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { WizardChoices, WizardNote } from "~/components/setup/Wizard.tsx";
import { cleanGroups, movePlayer, timeDate, timeText } from "~/lib/leaguesUi.ts";
import { dayDate, dayText } from "~/lib/setupHelpers.ts";
import type { Act, LeagueReply } from "~/lib/useLeague.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

type Settings = Partial<Pick<League, "scoring" | "skins" | "pairs">>;
type DraftGroup = { time: string; hole: number; scorer: string; players: string[] };
const EVERY = [8, 9, 10, 12, 15];
const STARTS: [TeeTiming["start"], string][] = [["1", "Off 1"], ["1&10", "Off 1 & 10"], ["shotgun", "Shotgun"]];
const ask = (title: string, message: string, action: string, destructive = false) => new Promise<boolean>((resolve) =>
  Alert.alert(title, message, [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: action, style: destructive ? "destructive" : "default", onPress: () => resolve(true) }]));

/**
 * League Settings (organizer; website LeagueSettings, part 5b): the code; who can watch; the tee times; the
 * leaderboard's Gross / Net; skins; the pairs game (format, gross / net, winner segments, draw rule, draw and lock);
 * then Copy, End and Delete. Every change saves straight away. Claude's call: emailing the code stays on the website.
 */
export function LeagueSettings({ open, onClose, league, problem, onSettings, act, onLive, onCopy, onDelete }: {
  open: boolean; onClose: () => void; league: League; problem: string | null; onSettings: (next: Settings) => Promise<LeagueReply>; act: Act;
  onLive: (next: LiveSettings) => Promise<LeagueReply>; onCopy: (date: string) => Promise<string | null>; onDelete: () => Promise<string | null>;
}) {
  const pairs = league.pairs;
  const setPairs = (next: Partial<League["pairs"]>) => void onSettings({ pairs: { ...pairs, ...next } });
  const setSkins = (next: Partial<League["skins"]>) => void onSettings({ skins: { ...league.skins, ...next } });
  const nameOf = (id: string) => league.players.find((p) => p.profileId === id)?.name ?? "Player";
  const started = league.holes.length > 0;
  const live = league.status === "live";
  const watching = liveSettingsFrom(league.liveVisibility, league.livePlayersCanShare, "private");
  const lateJoiner = pairs.teams.length > 0 && ungrouped({ players: league.players, groups: pairs.teams.map((team, i) => ({ number: i + 1, time: "", hole: 1, scorer: team[0], players: team })) }).length > 0;

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.top}><Text style={styles.title} accessibilityRole="header">League Settings</Text><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {problem && <WizardNote tone="error">{problem}</WizardNote>}
          <CodeCard kind="league" code={league.code} name={league.name} />

          <Section title="Who can watch">
            <WizardChoices label="The live site" value={watching.visibility} options={LIVE_VISIBILITIES.map((v) => [v, LIVE_VISIBILITY_COPY[v].label])}
              onChange={(visibility) => void onLive({ ...watching, visibility })} />
            <WizardNote>{LIVE_VISIBILITY_COPY[watching.visibility].detail}</WizardNote>
            {watching.visibility !== "private" && (
              <WizardChoices label="Players can share the link" value={watching.playersCanShare ? "yes" : "no"} options={[["yes", "Yes"], ["no", "No, only organizers"]]}
                onChange={(v) => void onLive({ ...watching, playersCanShare: v === "yes" })} />
            )}
          </Section>

          {live && <TeeTimesEditor league={league} onGroups={(groups) => void act({ action: "groups", groups })} />}

          {live && (
            <Section title="Leaderboard">
              <WizardChoices label="Scoring" value={league.scoring} options={[["Gross", "Gross"], ["Net", "Net"]]} onChange={(scoring: LeagueScoring) => void onSettings({ scoring })} />
            </Section>
          )}

          {live && (
            <Section title="Skins">
              <WizardChoices label="League-wide skins" value={league.skins.on ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => setSkins({ on: v === "on" })} />
              {league.skins.on && (
                <>
                  <WizardChoices label="Scoring" value={league.skins.net ? "net" : "gross"} options={[["gross", "Gross"], ["net", "Net"]]} onChange={(v) => setSkins({ net: v === "net" })} />
                  <WizardChoices label="Ties" value={league.skins.carryover ? "carry" : "none"} options={[["carry", "Carry over"], ["none", "No skin"]]} onChange={(v) => setSkins({ carryover: v === "carry" })} />
                </>
              )}
            </Section>
          )}

          {live && (
            <Section title="2-person pairs">
              <WizardChoices label="Pairs game" value={pairs.on ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => setPairs({ on: v === "on" })} />
              {pairs.on && (
                <>
                  <SelectField tone="dark" label="Format" value={pairs.format} options={PAIR_FORMATS.map((f) => ({ value: f.id, label: f.name }))} onChange={(format: PairFormat) => setPairs({ format })} />
                  <WizardNote>{PAIR_FORMATS.find((f) => f.id === pairs.format)?.blurb ?? ""}</WizardNote>
                  <WizardChoices label="Scoring" value={pairs.net ? "net" : "gross"} options={[["gross", "Gross"], ["net", "Net"]]} onChange={(v) => setPairs({ net: v === "net" })} />
                  <WizardChoices label="Winners" value={pairs.segments} options={SEGMENT_OPTIONS.map((o) => [o.value, o.name] as [PairSegments, string])} onChange={(segments) => setPairs({ segments })} />
                  {pairs.locked
                    ? <WizardNote>{`How pairs are drawn: ${PAIR_RULES.find((r) => r.id === pairs.rule)?.name ?? ""}`}</WizardNote>
                    : <SelectField tone="dark" label="How pairs are drawn" value={pairs.rule} options={PAIR_RULES.map((r) => ({ value: r.id, label: r.name }))} onChange={(rule: PairRule) => setPairs({ rule, locked: false })} />}
                  <WizardNote>{PAIR_RULES.find((r) => r.id === pairs.rule)?.blurb ?? ""}</WizardNote>
                  {pairs.teams.map((team, i) => <Text key={team.join()} style={styles.pair}>{`${i + 1}.  ${team.map(nameOf).join(" & ")}`}</Text>)}
                  {!pairs.locked && <Button label={pairs.teams.length ? "Re-draw" : "Draw pairs"} variant="secondaryOnDark" disabled={league.players.length < 2} onPress={() => setPairs({ teams: drawPairs(league, pairs.rule) })} />}
                  {!pairs.locked && pairs.teams.length > 0 && <Button label="Lock pairs" variant="secondaryOnDark" onPress={() => setPairs({ locked: true })} />}
                  {pairs.locked && !started && <Button label="Unlock to re-draw" variant="secondaryOnDark" onPress={() => setPairs({ locked: false })} />}
                  {league.players.length < 2 && <WizardNote>Pairs can be drawn once players have joined.</WizardNote>}
                  {pairs.locked && <WizardNote>{started ? "Locked. Pairs can't change once scores are in." : "Locked. Everyone sees these pairs."}</WizardNote>}
                  {lateJoiner && <WizardNote tone="warn">{`Someone joined after the pairs were drawn. ${pairs.locked && started ? "They aren't in a pair." : "Re-draw to include them."}`}</WizardNote>}
                </>
              )}
            </Section>
          )}

          <LeagueActions league={league} act={act} onCopy={onCopy} onDelete={onDelete} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>{children}</View>;
}

/** A time on the tee sheet: the phone's time wheel (compact on iPhone). */
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (time: string) => void }) {
  const [androidOpen, setAndroidOpen] = useState(false);
  const pick = (_e: unknown, date?: Date) => { setAndroidOpen(false); if (date) onChange(timeText(date)); };
  return (
    <View style={styles.timeField}>
      <Text style={styles.timeLabel}>{label}</Text>
      {Platform.OS === "ios"
        ? <DateTimePicker value={timeDate(value)} mode="time" display="compact" minuteInterval={1} onChange={pick} themeVariant="dark" accentColor={colors.gold} accessibilityLabel={label} />
        : <>
          <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setAndroidOpen(true)}><Text style={styles.timeValue}>{value || "Set"}</Text></Pressable>
          {androidOpen && <DateTimePicker value={timeDate(value)} mode="time" onChange={pick} />}
        </>}
    </View>
  );
}

/**
 * Tee Times (website TeeTimesEditor): make them (everyone shuffled into foursomes on the timing picked), then change any
 * group's time, starting hole or scorer, move a player to another group (or a new one), or put in someone who joined
 * later. Every change saves the whole set (a group whose players change starts its own game over).
 */
function TeeTimesEditor({ league, onGroups }: { league: League; onGroups: (groups: DraftGroup[]) => void }) {
  const [timing, setTiming] = useState<TeeTiming>({ first: "08:00", every: 10, start: "1" });
  const groups: DraftGroup[] = league.groups.map((g) => ({ time: g.time, hole: g.hole, scorer: g.scorer, players: g.players }));
  const loose = ungrouped(league);
  const nameOf = (id: string) => league.players.find((p) => p.profileId === id)?.name ?? "Player";
  const save = (next: DraftGroup[]) => onGroups(cleanGroups(next));
  const edit = (i: number, part: Partial<DraftGroup>) => save(groups.map((g, j) => (j === i ? { ...g, ...part } : g)));
  async function make() {
    if (groups.length && !await ask("Make new tee times?", "The groups you have now are replaced for everyone.", "Make new")) return;
    save(makeTeeTimes(league.players.map((p) => p.profileId), timing));
  }
  const moveTo = (id: string, current: number | null) => (
    <SelectField tone="dark" label={current == null ? "Add to" : "Move to"} value={current == null ? null : String(current)} placeholder="Choose"
      options={[...groups.flatMap((g, j) => (j !== current && g.players.length < 5 ? [{ value: String(j), label: `Group ${j + 1}` }] : [])), { value: String(groups.length), label: "New group" }]}
      onChange={(v) => { const to = Number(v); if (to !== current) onGroups(movePlayer(groups, id, to, timing.first)); }} />
  );

  return (
    <Section title="Tee Times">
      <TimeField label="First tee time" value={timing.first} onChange={(first) => setTiming({ ...timing, first })} />
      <WizardChoices label="Every" value={timing.every} options={EVERY.map((m) => [m, `${m} min`] as [number, string])} onChange={(every) => setTiming({ ...timing, every })} />
      <WizardChoices label="Start" value={timing.start} options={STARTS} onChange={(start) => setTiming({ ...timing, start })} />
      <Button label={groups.length ? "Re-make tee times" : "Make tee times"} variant="secondaryOnDark" disabled={!league.players.length} onPress={() => void make()} />
      {!league.players.length && <WizardNote>Tee times can be made once players have joined.</WizardNote>}
      {loose.length > 0 && groups.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Not in a group</Text>
          {loose.map((p) => <View key={p.profileId} style={styles.player}><Text style={styles.playerName}>{p.name}</Text>{moveTo(p.profileId, null)}</View>)}
        </View>
      )}
      {groups.map((g, i) => (
        <View key={i} style={styles.group}>
          <Text style={styles.groupTitle}>{`Group ${i + 1}${league.groups[i]?.submitted ? " · Card in" : ""}`}</Text>
          <TimeField label="Time" value={g.time} onChange={(time) => edit(i, { time })} />
          <SelectField tone="dark" label="Hole" value={String(g.hole)} options={Array.from({ length: 18 }, (_, h) => ({ value: String(h + 1), label: String(h + 1) }))} onChange={(v) => edit(i, { hole: Number(v) })} />
          <SelectField tone="dark" label="Scorer" value={g.scorer} options={g.players.map((id) => ({ value: id, label: nameOf(id) }))} onChange={(scorer) => edit(i, { scorer })} />
          {g.players.map((id) => <View key={id} style={styles.player}><Text style={styles.playerName}>{nameOf(id)}</Text>{moveTo(id, i)}</View>)}
        </View>
      ))}
    </Section>
  );
}

/** Copy (next time's league: same players and settings, a new date), End (scores lock) and Delete (gone for everyone). */
function LeagueActions({ league, act, onCopy, onDelete }: { league: League; act: Act; onCopy: (date: string) => Promise<string | null>; onDelete: () => Promise<string | null> }) {
  const [copyDate, setCopyDate] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<string | null>) => { setBusy(true); setNote(await task()); setBusy(false); };
  return (
    <Section title="League">
      {copyDate === null ? (
        <>
          <Button label="Copy this league" variant="secondaryOnDark" onPress={() => setCopyDate(dayText(new Date()))} />
          {league.status === "live" && <Button label="End league" variant="secondaryOnDark" disabled={busy} onPress={() => void (async () => {
            if (await ask("End the league?", "Scores lock and it moves to Past.", "End league")) void run(async () => { const r = await act({ action: "end" }); return r.ok ? null : r.message ?? "Couldn't end the league."; });
          })()} />}
          <Button label="Delete league" variant="danger" disabled={busy} onPress={() => void (async () => {
            if (await ask(`Delete ${league.name}?`, "It's deleted for everyone. This can't be undone.", "Delete", true)) void run(onDelete);
          })()} />
        </>
      ) : (
        <>
          <WizardNote>A new league with the same players and settings. Tee times and pairs start fresh.</WizardNote>
          <DateField tone="dark" label="New date" value={dayDate(copyDate)} minimumDate={new Date()} onChange={(d) => setCopyDate(dayText(d))} />
          <Button label={busy ? "Copying…" : "Make the copy"} disabled={busy} loading={busy} onPress={() => void run(() => onCopy(copyDate))} />
          <Button label="Cancel" variant="secondaryOnDark" onPress={() => setCopyDate(null)} />
        </>
      )}
      {note && <WizardNote tone="error">{note}</WizardNote>}
    </Section>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: gutter },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
  content: { gap: 22, paddingHorizontal: gutter, paddingBottom: 64 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fonts.capsBold, fontSize: 12, letterSpacing: 1.2, color: colors.gold },
  pair: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  group: { gap: 8, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  groupTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  player: { gap: 6 },
  playerName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  timeField: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  timeLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.wizardMuted },
  timeValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
});
