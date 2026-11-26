import { useState } from "react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import { travelFromFlightPlan } from "@/lib/platform/golfTripDetails";
import type { GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { acceptedMembers } from "@/lib/platform/golfTripMembers";
import { defaultRoundComp, ROUND_FORMATS, type RoundCompSettings } from "@/lib/platform/roundCompetition";
import type { SetupBasis } from "@/lib/platform/savedTripSetup";
import { teamDraftTeamCount, teamLetter } from "@/lib/platform/teamDraft";
import { TRIP_GAMES } from "@/lib/platform/tripGames";
import { tripSchedule, type ScheduleSlot } from "@/lib/platform/tripScheduleView";
import { apiRaw } from "~/lib/api.ts";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

type Write = (field: string, value: unknown) => void;
type Props = { values: Record<string, unknown>; write: Write; basis: SetupBasis; trip: SavedGolfTrip; readOnly: boolean };
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeLabel = (t: string) => { const [h, m] = t.split(":").map(Number); return Number.isFinite(h) ? `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}` : t; };
const setNums = (value: unknown, fallback: number[]): number[] => value && typeof value === "object" && Array.isArray((value as { $set?: unknown }).$set) ? (value as { $set: number[] }).$set : fallback;
/** A round is locked once its day has come (the website locks it once play starts; the server refuses unsafe changes too). */
const playedOrToday = (slot: ScheduleSlot) => slot.date <= todayIso();

/**
 * Trip Settings → the setup editors in the app (project_specs.md Golf Trips part 2g slice 2): Golf Schedule, Games,
 * Individual / Team Competition, Skins, Match Selection and the trip's basics. Every change is one saved setting through
 * useTripSetup (latest settings + revision; the server checks each setting with the website's own rules), keyed exactly
 * like the website (rounds by "golfDay-slot", players by their place in the trip's accepted list).
 */
export function GolfSchedule({ values, write, basis, readOnly }: Props) {
  const view = tripSchedule(values, basis);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const counts = (values.roundsPerDay as Record<string, number> | undefined) ?? Object.fromEntries(view.days.map((d) => [d.index, d.count]));
  const setCourse = (slot: ScheduleSlot, course: string) => {
    const clean = course.trim();
    if (!clean) return;
    if (slot.picked) write("pickedCourses", { ...(values.pickedCourses as object ?? {}), [slot.key]: { name: clean } });
    else write("slotCourseNames", { ...(values.slotCourseNames as object ?? {}), [slot.key]: clean });
  };
  const setTimes = (slot: ScheduleSlot, times: string[]) => write("teeTimes", { ...(values.teeTimes as object ?? {}), [slot.key]: times });
  return <>
    <Box title="Golf days">
      <Toggle label="Golf on arrival day" value={view.golfOnArrival} disabled={readOnly} onChange={(v) => write("golfOnArrival", v)} />
      <Toggle label="Golf on departure day" value={view.golfOnDeparture} disabled={readOnly} onChange={(v) => write("golfOnDeparture", v)} />
    </Box>
    {view.days.length === 0 && <Text style={styles.muted}>No golf days yet. Set the trip dates first.</Text>}
    {view.days.map((day) => <Box key={day.index} title={`Golf Day ${day.index + 1} · ${isoDay(day.date)}`}>
      <Stepper label="Rounds" value={day.count} min={0} max={2} disabled={readOnly || day.slots.some(playedOrToday) || day.date <= todayIso()}
        onChange={(n) => write("roundsPerDay", { ...counts, [day.index]: n })} />
      {day.slots.map((slot) => {
        const locked = readOnly || playedOrToday(slot);
        return <View key={slot.key} style={styles.item}>
          <Text style={styles.itemTitle}>Round {slot.number}</Text>
          {editing === slot.key ? <View style={{ gap: 8 }}>
            <TextInput value={name} onChangeText={setName} placeholder="Course name" placeholderTextColor={colors.searchFaint} style={styles.input} accessibilityLabel={`Round ${slot.number} course`} autoFocus />
            <View style={styles.row}>
              <Small label="Cancel" onPress={() => setEditing(null)} />
              <Small label="Save course" onPress={() => { setCourse(slot, name); setEditing(null); }} />
            </View>
            <Text style={styles.muted}>Changing a round's course clears its confirmed pars.</Text>
          </View> : <Pressable accessibilityRole="button" disabled={locked} onPress={() => { setName(slot.course === "Course TBD" ? "" : slot.course); setEditing(slot.key); }}>
            <Text style={[styles.value, locked && styles.dim]}>{slot.course}</Text>
          </Pressable>}
          <Text style={styles.label}>Tee times</Text>
          {slot.teeTimes.map((t, i) => <View key={i} style={styles.row}>
            <TimeField label={`Group ${i + 1}`} value={t} disabled={locked} onChange={(v) => setTimes(slot, slot.teeTimes.map((x, j) => j === i ? v : x))} />
            {!locked && <Small label="Remove" onPress={() => setTimes(slot, slot.teeTimes.filter((_, j) => j !== i))} />}
          </View>)}
          {!locked && slot.teeTimes.length < 16 && <Small label="+ Add tee time" onPress={() => setTimes(slot, [...slot.teeTimes, slot.teeTimes.at(-1) ? bump(slot.teeTimes.at(-1)!) : "08:00"])} />}
          {locked && !readOnly && <Text style={styles.muted}>This round's day has come, so its schedule is locked.</Text>}
        </View>;
      })}
    </Box>)}
  </>;
}
const bump = (t: string) => { const [h, m] = t.split(":").map(Number); const total = Math.min(23 * 60 + 50, h * 60 + m + 10); return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`; };

export function Games({ values, write, basis, readOnly }: Props) {
  const view = tripSchedule(values, basis);
  const [round, setRound] = useState(view.slots[0]?.number ?? 1);
  const games = (values.gameRounds as Record<string, string[]> | undefined) ?? {};
  if (!view.slots.length) return <Text style={styles.muted}>Add rounds in Golf Schedule first.</Text>;
  const list = games[round] ?? [];
  return <>
    <Chips items={view.slots.map((s) => [s.number, `Round ${s.number}${games[s.number]?.length ? ` · ${games[s.number].length}` : ""}`] as [number, string])} value={round} onChange={setRound} />
    <Box title={`Round ${round} games`}>
      <Text style={styles.muted}>Games switched on here show up for every group on that round, ready to play.</Text>
      {TRIP_GAMES.map((def) => {
        const on = list.includes(def.id);
        return <Toggle key={def.id} label={def.name} note={`${def.players.join(" / ")} players · ${def.blurb}`} value={on} disabled={readOnly}
          onChange={() => write("gameRounds", { ...games, [round]: on ? list.filter((id) => id !== def.id) : [...list, def.id] })} />;
      })}
    </Box>
  </>;
}

export function Competition({ values, write, basis, trip, readOnly, kind }: Props & { kind: "individual" | "team" }) {
  const view = tripSchedule(values, basis);
  const types = (values.localCompetitionType as { individual: string | null; team: string | null } | undefined) ?? { individual: null, team: null };
  const players = acceptedMembers(trip.members);
  const total = Number(values.playerTotal) || players.length;
  const options = kind === "individual" ? [null, "Stroke Play", "Stableford", "Match Play"] : [null, "2 Teams", "Pairs", "3-Ball", "4-Ball"];
  const current = types[kind];
  const compRounds = (values.compRounds as Record<string, boolean> | undefined) ?? {};
  const formats = (values.compFormats as Record<string, RoundCompSettings> | undefined) ?? {};
  const [open, setOpen] = useState<string | null>(null);
  return <>
    <Box title={kind === "individual" ? "Individual competition" : "Team competition"}>
      <Chips items={options.map((o) => [o ?? "none", o ?? "None"] as [string, string])} value={current ?? "none"} disabled={readOnly}
        onChange={(v) => write("localCompetitionType", { ...types, [kind]: v === "none" ? null : v })} />
    </Box>
    {current && <Box title="Competition rounds">
      {view.slots.length === 0 && <Text style={styles.muted}>Add rounds in Golf Schedule first.</Text>}
      {view.slots.map((slot) => {
        const on = compRounds[slot.key] ?? true, locked = readOnly || playedOrToday(slot);
        const fmt = formats[slot.key] ?? defaultRoundComp(total);
        return <View key={slot.key} style={styles.item}>
          <Toggle label={`Round ${slot.number} · ${slot.course}`} note={isoDay(slot.date)} value={on} disabled={locked}
            onChange={(v) => {
              if (v) return write("compRounds", { ...compRounds, [slot.key]: true });
              Alert.alert(`Take Round ${slot.number} out of the competition?`, "Its format settings are cleared.", [{ text: "Keep", style: "cancel" }, { text: "Take out", style: "destructive", onPress: () => {
                write("compRounds", { ...compRounds, [slot.key]: false });
                const next = { ...formats }; delete next[slot.key]; write("compFormats", next);
              } }]);
            }} />
          {kind === "team" && on && <>
            <Pressable accessibilityRole="button" onPress={() => setOpen(open === slot.key ? null : slot.key)}><Text style={styles.link}>{fmt.format} · {fmt.matchType} · {fmt.scoring}{fmt.nassau ? " · Nassau" : ""} · {fmt.pointsPerMatch} pt{open === slot.key ? "  ▲" : "  ▼"}</Text></Pressable>
            {open === slot.key && <RoundFormat value={fmt} disabled={locked} onChange={(next) => write("compFormats", { ...formats, [slot.key]: next })} />}
          </>}
        </View>;
      })}
    </Box>}
    {kind === "team" && current && <Teams values={values} write={write} trip={trip} readOnly={readOnly} teamType={current} />}
  </>;
}

function RoundFormat({ value, onChange, disabled }: { value: RoundCompSettings; onChange: (v: RoundCompSettings) => void; disabled: boolean }) {
  const set = (part: Partial<RoundCompSettings>) => onChange({ ...value, ...part });
  return <View style={{ gap: 8 }}>
    <Text style={styles.label}>Format</Text>
    <Chips items={ROUND_FORMATS.map((f) => [f.name, f.name] as [string, string])} value={value.format} disabled={disabled} onChange={(format) => set({ format: format as RoundCompSettings["format"] })} />
    <Text style={styles.muted}>{ROUND_FORMATS.find((f) => f.name === value.format)?.summary}</Text>
    <Text style={styles.label}>Match type</Text>
    <Chips items={[["Match Play", "Match Play"], ["Stroke Play", "Stroke Play"]]} value={value.matchType} disabled={disabled} onChange={(matchType) => set({ matchType: matchType as RoundCompSettings["matchType"] })} />
    <Text style={styles.label}>Scoring</Text>
    <Chips items={[["Gross", "Gross"], ["Net", "Net"], ["Both", "Both"]]} value={value.scoring} disabled={disabled} onChange={(scoring) => set({ scoring: scoring as RoundCompSettings["scoring"] })} />
    <Stepper label="Points per match" value={value.pointsPerMatch} min={0} max={10} step={0.5} disabled={disabled} onChange={(pointsPerMatch) => set({ pointsPerMatch })} />
    <Toggle label="Nassau (front 9, back 9 and overall each pay)" value={value.nassau} disabled={disabled} onChange={(nassau) => set({ nassau })} />
  </View>;
}

function Teams({ values, write, trip, readOnly, teamType }: { values: Record<string, unknown>; write: Write; trip: SavedGolfTrip; readOnly: boolean; teamType: string }) {
  const players = acceptedMembers(trip.members);
  const count = Math.max(2, teamDraftTeamCount(teamType, Number(values.playerTotal) || players.length));
  const names = (values.teamNames as string[] | undefined) ?? [];
  const selection = (values.teamSelection as string | null | undefined) ?? null;
  const picks = (values.teamPicks as Record<string, number> | undefined) ?? {};
  const captains = (values.draftCaptains as Record<string, string> | undefined) ?? {};
  const [nameDraft, setNameDraft] = useState<string[]>(Array.from({ length: count }, (_, i) => names[i] ?? ""));
  return <>
    <Box title="Team names">
      {Array.from({ length: count }, (_, i) => <TextInput key={i} value={nameDraft[i] ?? ""} editable={!readOnly} placeholder={`Team ${teamLetter(i)}`} placeholderTextColor={colors.searchFaint} maxLength={120} style={styles.input}
        accessibilityLabel={`Team ${teamLetter(i)} name`} onChangeText={(t) => setNameDraft((d) => Object.assign([...d], { [i]: t }))}
        onEndEditing={() => write("teamNames", Array.from({ length: count }, (_, j) => (nameDraft[j] ?? "").trim()))} />)}
    </Box>
    <Box title="Team selection">
      <Chips items={[["Manual", "Manual"], ["Draft", "Draft"], ["Random", "Random"]]} value={selection ?? ""} disabled={readOnly} onChange={(v) => write("teamSelection", v)} />
      {selection === "Manual" && players.map((p, index) => <View key={p.id} style={styles.kv}>
        <Text style={styles.value}>{p.displayName}</Text>
        <Chips items={Array.from({ length: count }, (_, t) => [t, names[t]?.trim() || `Team ${teamLetter(t)}`] as [number, string])} value={picks[index] ?? -1} disabled={readOnly}
          onChange={(t) => write("teamPicks", { ...picks, [index]: t })} />
      </View>)}
      {selection === "Draft" && <>
        <Text style={styles.label}>Draft order</Text>
        <Chips items={[["Snake", "Snake"], ["Straight", "Straight"]]} value={(values.draftType as string) ?? "Snake"} disabled={readOnly} onChange={(v) => write("draftType", v)} />
        <Text style={styles.label}>Draft type</Text>
        <Chips items={[["Captain's Picks", "Captain's Picks"], ["Duck Race", "Duck Race"]]} value={(values.draftMethod as string) ?? "Captain's Picks"} disabled={readOnly} onChange={(v) => write("draftMethod", v)} />
        <DateField label="Draft day" value={(values.draftDate as string) ?? ""} disabled={readOnly} onChange={(v) => write("draftDate", v)} />
        <TimeField label="Draft time" value={(values.draftTime as string) ?? ""} disabled={readOnly} onChange={(v) => write("draftTime", v)} />
        <Text style={styles.label}>Captains</Text>
        {Array.from({ length: count }, (_, t) => <View key={t} style={{ gap: 6 }}>
          <Text style={styles.value}>{names[t]?.trim() || `Team ${teamLetter(t)}`}</Text>
          <Chips items={players.filter((p) => p.profileId).map((p) => [p.profileId!, p.displayName] as [string, string])} value={captains[t] ?? ""} disabled={readOnly}
            onChange={(id) => write("draftCaptains", { ...captains, [t]: id })} />
        </View>)}
      </>}
      {selection === "Random" && <Text style={styles.muted}>Teams are drawn at random from everyone who's joined.</Text>}
    </Box>
  </>;
}

export function Skins({ values, write, basis, trip, readOnly }: Props) {
  const view = tripSchedule(values, basis);
  const on = values.skinsOn === true;
  const rounds = (values.skinsRounds as Record<string, boolean> | undefined) ?? {};
  const playersBy = (values.skinsPlayers as Record<string, unknown> | undefined) ?? {};
  const players = acceptedMembers(trip.members);
  const all = players.map((_, i) => i);
  const [open, setOpen] = useState<string | null>(null);
  return <>
    <Box title="Skins">
      <Toggle label="Skins" value={on} disabled={readOnly} onChange={(v) => write("skinsOn", v)} />
      <Text style={styles.label}>Scoring</Text>
      <Chips items={[["Gross", "Gross"], ["Net", "Net"]]} value={(values.skinsScoring as string) ?? "Gross"} disabled={readOnly || !on} onChange={(v) => write("skinsScoring", v)} />
    </Box>
    {on && <Box title="Rounds">
      {view.slots.map((slot) => {
        const roundOn = rounds[slot.key] ?? true, locked = readOnly || playedOrToday(slot);
        const inSkins = setNums(playersBy[slot.key], all);
        return <View key={slot.key} style={styles.item}>
          <Toggle label={`Round ${slot.number} · ${slot.course}`} note={roundOn ? `${inSkins.length} players` : "Off"} value={roundOn} disabled={locked} onChange={(v) => write("skinsRounds", { ...rounds, [slot.key]: v })} />
          {roundOn && <Pressable accessibilityRole="button" onPress={() => setOpen(open === slot.key ? null : slot.key)}><Text style={styles.link}>Players {open === slot.key ? "▲" : "▼"}</Text></Pressable>}
          {roundOn && open === slot.key && players.map((p, i) => <Toggle key={p.id} label={p.displayName} value={inSkins.includes(i)} disabled={locked}
            onChange={(v) => write("skinsPlayers", { ...playersBy, [slot.key]: { $set: v ? [...inSkins, i].sort((a, b) => a - b) : inSkins.filter((x) => x !== i) } })} />)}
        </View>;
      })}
    </Box>}
  </>;
}

type Choice = { method: string | null; draftType: string | null; date: string; time: string; rankMinutes?: number; putForwardMinutes?: number; responseMinutes?: number };
const NO_CHOICE: Choice = { method: null, draftType: null, date: "", time: "" };
export function MatchSelection({ values, write, basis, readOnly }: Props) {
  const view = tripSchedule(values, basis);
  const perRound = values.matchPerRound === true;
  const all = (values.allRoundsMatch as Choice | undefined) ?? NO_CHOICE;
  const each = (values.matchSelections as Record<string, Choice> | undefined) ?? {};
  const compRounds = (values.compRounds as Record<string, boolean> | undefined) ?? {};
  const editor = (choice: Choice, save: (c: Choice) => void, locked: boolean) => <View style={{ gap: 8 }}>
    <Chips items={[["", "Not set"], ["Manual", "Manual"], ["Match Draft", "Match Draft"], ["Round Robin", "Round Robin"]]} value={choice.method ?? ""} disabled={locked}
      onChange={(m) => save({ ...choice, method: m || null, draftType: m === "Match Draft" ? choice.draftType ?? "Response" : null })} />
    {choice.method === "Match Draft" && <>
      <Text style={styles.label}>Selection type</Text>
      <Chips items={[["Response", "Response"], ["Ranks", "Ranks"], ["Randomized", "Randomized"]]} value={choice.draftType ?? "Response"} disabled={locked} onChange={(draftType) => save({ ...choice, draftType })} />
      <DateField label="Selection day" value={choice.date} disabled={locked} onChange={(date) => save({ ...choice, date })} />
      <TimeField label="Selection time" value={choice.time} disabled={locked} onChange={(time) => save({ ...choice, time })} />
      <Text style={styles.muted}>The selection must come after the team draft (the server checks).</Text>
    </>}
  </View>;
  return <>
    <Box title="Match Selection">
      <Toggle label="Set each round separately" value={perRound} disabled={readOnly} onChange={(v) => write("matchPerRound", v)} />
      {!perRound && editor(all, (c) => write("allRoundsMatch", c), readOnly)}
    </Box>
    {perRound && view.slots.filter((s) => compRounds[s.key] ?? true).map((slot) => <Box key={slot.key} title={`Round ${slot.number} · ${slot.course}`}>
      {editor(each[slot.key] ?? NO_CHOICE, (c) => write("matchSelections", { ...each, [slot.key]: c }), readOnly || playedOrToday(slot))}
    </Box>)}
  </>;
}

/** General Settings, editable for the organizer: name / destination (trip details), arrival and length, player amount. */
export function GeneralEditor({ values, write, basis, trip, draft, readOnly, onChanged }: Props & { draft: GolfTripDraft; onChanged: () => void }) {
  const view = tripSchedule(values, basis);
  const joined = acceptedMembers(trip.members).length;
  const [name, setName] = useState(trip.trip.name);
  const [destination, setDestination] = useState(trip.trip.destination ?? "");
  const [message, setMessage] = useState("");
  const saveDetails = async () => {
    const unchanged = destination.trim() === (trip.trip.destination ?? "");
    const r = await apiRaw<{ ok?: boolean; error?: string }>(`/api/golf-trips/${trip.trip.id}/details`, { method: "PATCH", body: {
      tripName: name, destination, travelMode: travelFromFlightPlan(trip.trip.flight_plan),
      ...(unchanged ? { destinationPlaceId: draft.destinationPlaceId ?? "", destinationLatitude: draft.destinationLatitude ?? "", destinationLongitude: draft.destinationLongitude ?? "" } : {}) } });
    if (r.status === 200 && r.body?.ok) { setMessage("Saved"); onChanged(); } else setMessage(r.status === 0 ? "You're offline. Not saved." : r.body?.error ?? "Couldn't save the trip details.");
  };
  const shift = (days: number) => write("arrivalShift", Number(values.arrivalShift ?? 0) + days);
  const anyPlayed = view.slots.some(playedOrToday);
  return <>
    <Box title="Trip">
      <Text style={styles.label}>Name</Text>
      <TextInput value={name} onChangeText={setName} editable={!readOnly} maxLength={120} style={styles.input} accessibilityLabel="Trip name" />
      <Text style={styles.label}>Destination</Text>
      <TextInput value={destination} onChangeText={setDestination} editable={!readOnly} maxLength={200} style={styles.input} accessibilityLabel="Destination" />
      <Text style={styles.muted}>Typing a new destination clears its map spot (Venue distances); pick the place on the website to set it again.</Text>
      {!readOnly && <Small label="Save trip details" onPress={() => void saveDetails()} />}
      {!!message && <Text style={styles.muted}>{message}</Text>}
    </Box>
    <Box title="Dates">
      <View style={styles.kv}><Text style={styles.muted}>Arrival</Text><Text style={styles.value}>{isoDay(view.arrival)}</Text></View>
      {!readOnly && !anyPlayed && <View style={styles.row}><Small label="‹ Day earlier" onPress={() => shift(-1)} /><Small label="Day later ›" onPress={() => shift(1)} /></View>}
      <Stepper label="Trip length (days)" value={view.dayCount} min={1} max={31} disabled={readOnly || anyPlayed} onChange={(n) => write("dayCount", n)} />
      <View style={styles.kv}><Text style={styles.muted}>Departure</Text><Text style={styles.value}>{isoDay(view.departure)}</Text></View>
      {anyPlayed && <Text style={styles.muted}>Dates are locked once the first round's day has come.</Text>}
    </Box>
    <Box title="Players">
      <Stepper label="Player amount" value={Number(values.playerTotal) || joined} min={Math.max(1, joined)} max={64} disabled={readOnly} onChange={(n) => write("playerTotal", n)} />
      <Text style={styles.muted}>{joined} joined. Remove a joined player before going below that.</Text>
    </Box>
  </>;
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.box} accessibilityLabel={title}><Text style={styles.boxTitle}>{title}</Text>{children}</View>;
}
function Toggle({ label, note, value, onChange, disabled = false }: { label: string; note?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <View style={[styles.toggle, disabled && styles.dim]}><View style={{ flex: 1 }}><Text style={styles.value}>{label}</Text>{note && <Text style={styles.muted}>{note}</Text>}</View>
    <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.goldBright }} accessibilityLabel={label} /></View>;
}
function Chips<T extends string | number>({ items, value, onChange, disabled = false }: { items: [T, string][]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return <View style={styles.chips}>{items.map(([v, label]) => <Pressable key={String(v)} accessibilityRole="radio" accessibilityState={{ checked: value === v, disabled }} disabled={disabled} onPress={() => onChange(v)}
    style={[styles.chip, value === v && styles.chipOn, disabled && styles.dim]}><Text style={[styles.chipText, value === v && styles.chipTextOn]}>{label}</Text></Pressable>)}</View>;
}
function Stepper({ label, value, min, max, step = 1, onChange, disabled = false }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; disabled?: boolean }) {
  return <View style={[styles.toggle, disabled && styles.dim]}><Text style={[styles.value, { flex: 1 }]}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Less ${label}`} disabled={disabled || value <= min} onPress={() => onChange(Math.max(min, value - step))} style={styles.step}><Text style={styles.stepText}>−</Text></Pressable>
    <Text style={styles.stepValue} accessibilityLiveRegion="polite">{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`More ${label}`} disabled={disabled || value >= max} onPress={() => onChange(Math.min(max, value + step))} style={styles.step}><Text style={styles.stepText}>+</Text></Pressable></View>;
}
function Small({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.small}><Text style={styles.smallText}>{label}</Text></Pressable>;
}
function TimeField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [h, m] = (value || "08:00").split(":").map(Number);
  const pick = (e: DateTimePickerEvent, d?: Date) => { if (e.type === "set" && d) onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`); };
  return <View style={[styles.toggle, { flex: 1 }]}><Text style={styles.value}>{label}</Text>
    {disabled ? <Text style={styles.value}>{value ? timeLabel(value) : "Not set"}</Text>
      : <DateTimePicker value={new Date(2000, 0, 1, h || 8, m || 0)} mode="time" display="compact" minuteInterval={5} onChange={pick} themeVariant="dark" accentColor={colors.gold} accessibilityLabel={label} />}</View>;
}
function DateField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  const pick = (e: DateTimePickerEvent, d?: Date) => { if (e.type === "set" && d) onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); };
  return <View style={styles.toggle}><Text style={[styles.value, { flex: 1 }]}>{label}</Text>
    {disabled ? <Text style={styles.value}>{value || "Not set"}</Text>
      : <DateTimePicker value={base} mode="date" display="compact" onChange={pick} themeVariant="dark" accentColor={colors.gold} accessibilityLabel={label} />}</View>;
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  boxTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  item: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  itemTitle: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  value: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardLink, paddingVertical: 6 },
  dim: { opacity: 0.45 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  kv: { gap: 6, paddingVertical: 4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: minTap },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, justifyContent: "center" },
  chipOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  chipTextOn: { color: colors.maroon900 },
  input: { minHeight: 46, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.inputOnMaroon, color: colors.cream, fontFamily: fonts.regular, fontSize: 15 },
  step: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  stepText: { fontFamily: fonts.bold, fontSize: 20, color: colors.goldBright },
  stepValue: { minWidth: 34, textAlign: "center", fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  small: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, justifyContent: "center", alignSelf: "flex-start" },
  smallText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
});
