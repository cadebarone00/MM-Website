import { useState } from "react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ITINERARY_KIND_LABEL } from "@/lib/platform/golfTripItinerary";
import { checkTravelInput, cleanDetails, type TravelDetails, type TravelItem, type TravelKind, type TripTravel } from "@/lib/platform/tripTravel";
import { Avatar } from "~/components/Avatar.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/** What a player can add themselves (dinners and tee times come from the organizer). */
export const ADDABLE: { kind: TravelKind; label: string }[] = [
  { kind: "flight", label: "Flight" }, { kind: "ride", label: "Ride or rental car" }, { kind: "lodging", label: "Lodging" }, { kind: "other", label: "Other plans" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fromLocal = (s: string) => { const [date, time] = s.split("T"); const [y, m, d] = date.split("-").map(Number); const [h, min] = (time ?? "00:00").split(":").map(Number); return new Date(y, m - 1, d, h, min); };

type Fields = { airline: string; flightNumber: string; from: string; to: string; rideType: "driving" | "rental"; place: string; seats: string; name: string; note: string; startsAt: string; endsAt: string };

/**
 * Add / edit one of my plans in the app (website GolfTripMyTravel TravelForm, project_specs.md Golf Trips part 2f): the
 * fields change with the kind; the same checks as the website and server (`checkTravelInput`, `cleanDetails`) show under
 * each field. Save = just me; Save & Invite = save, then pick who to invite. `initial` fills a new plan (Venue → Add to
 * itinerary puts the place in). `defaultDay` starts the time on the day being looked at.
 */
export function TripTravelForm({ kind, item, initial, defaultDay, onSave, onClose, onBack }: {
  kind: TravelKind; item?: TravelItem; initial?: TravelDetails; defaultDay?: string;
  onSave: (details: TravelDetails, startsAt: string, endsAt: string | undefined, invite: boolean) => void; onClose: () => void; onBack?: () => void;
}) {
  const d = item?.details ?? initial ?? {};
  const [fields, setFields] = useState<Fields>({
    airline: d.airline ?? "", flightNumber: d.flightNumber ?? "", from: d.from ?? "", to: d.to ?? "", rideType: d.rideType ?? "driving",
    place: d.place ?? "", seats: d.seats !== undefined ? String(d.seats) : "", name: d.name ?? "", note: d.note ?? "",
    startsAt: item?.startsAt ?? "", endsAt: item?.endsAt ?? "",
  });
  const [problems, setProblems] = useState<ReturnType<typeof checkTravelInput>>({});
  const set = (key: keyof Fields) => (value: string) => setFields((f) => ({ ...f, [key]: value }));
  const rental = kind === "ride" && fields.rideType === "rental";
  const save = (invite: boolean) => {
    const raw: TravelDetails = { airline: fields.airline, flightNumber: fields.flightNumber, from: fields.from, to: fields.to, rideType: fields.rideType,
      place: fields.place, seats: fields.seats.trim() === "" ? undefined : Number(fields.seats), name: fields.name, note: fields.note, placeId: d.placeId };
    const endsAt = fields.endsAt || undefined;
    const found = checkTravelInput(kind, raw, fields.startsAt, endsAt);
    setProblems(found);
    if (Object.keys(found).length === 0) onSave(cleanDetails(kind, raw), fields.startsAt, endsAt, invite);
  };
  const title = `${item ? "Edit" : "Add"} ${kind === "ride" ? "ride" : ITINERARY_KIND_LABEL[kind].toLowerCase()}`;
  const when = (label: string, key: "startsAt" | "endsAt", optional = false) =>
    <WhenField label={label} value={fields[key]} optional={optional} onChange={set(key)} problem={problems[key]} defaultDay={defaultDay} />;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.top}>
          {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Back to add choices" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable> : <View style={styles.back} />}
          <Text style={styles.title}>{title}</Text>
          <SheetClose onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 14 }} keyboardShouldPersistTaps="handled">
          {kind === "flight" && <>
            <Field label="Airline" value={fields.airline} onChange={set("airline")} placeholder="American Airlines" />
            <Field label="Flight number" value={fields.flightNumber} onChange={set("flightNumber")} placeholder="AA1234" problem={problems.flightNumber} upper />
            <View style={styles.pair}>
              <Field label="From" value={fields.from} onChange={set("from")} placeholder="RDU" problem={problems.from} upper />
              <Field label="To" value={fields.to} onChange={set("to")} placeholder="PHX" problem={problems.to} upper />
            </View>
            {when("Departs", "startsAt")}{when("Lands (optional)", "endsAt", true)}
          </>}
          {kind === "ride" && <>
            <View style={styles.choice} accessibilityRole="radiogroup" accessibilityLabel="Ride type">
              {(["driving", "rental"] as const).map((t) => <Pressable key={t} accessibilityRole="radio" accessibilityState={{ checked: fields.rideType === t }} onPress={() => set("rideType")(t)} style={[styles.choiceItem, fields.rideType === t && styles.on]}>
                <Text style={[styles.choiceText, fields.rideType === t && styles.onText]}>{t === "driving" ? "I'm driving" : "Rental car"}</Text></Pressable>)}
            </View>
            {rental ? <Field label="Pickup at" value={fields.place} onChange={set("place")} placeholder="PHX Rental Car Center" />
              : <View style={styles.pair}>
                <Field label="Driving from" value={fields.from} onChange={set("from")} placeholder="Tucson" problem={problems.from} />
                <Field label="To (optional)" value={fields.to} onChange={set("to")} placeholder="Scottsdale" />
              </View>}
            {when(rental ? "Pickup" : "Leaving", "startsAt")}{when(rental ? "Return (optional)" : "Heading back (optional)", "endsAt", true)}
            <Field label="Open seats (optional)" value={fields.seats} onChange={set("seats")} placeholder="2" problem={problems.seats} number />
          </>}
          {kind === "lodging" && <>
            <Field label="Where you're staying" value={fields.name} onChange={set("name")} placeholder="The Shorebreak Villas" problem={problems.name} />
            <Field label="Area or address (optional)" value={fields.place} onChange={set("place")} placeholder="Scottsdale" />
            {when("Check-in", "startsAt")}{when("Check-out (optional)", "endsAt", true)}
          </>}
          {kind === "other" && <>
            <Field label="What" value={fields.name} onChange={set("name")} placeholder="Spa appointment" problem={problems.name} />
            {when("When", "startsAt")}
            <Field label="Where (optional)" value={fields.place} onChange={set("place")} placeholder="Hotel spa" />
            <Field label="Note (optional)" value={fields.note} onChange={set("note")} placeholder="Booked for 2" />
          </>}
        </ScrollView>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => save(false)} style={styles.secondary}><Text style={styles.secondaryText}>Save</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => save(true)} style={styles.primary}><Text style={styles.primaryText}>Save & Invite</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** After Save & Invite: the trip's other members with a tick each. Anyone already invited or going is ticked and locked. */
export function InvitePeople({ travel, itemId, onSend, onClose }: { travel: TripTravel; itemId: string; onSend: (memberIds: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const others = travel.members.filter((m) => m.id !== travel.meId);
  const statusOf = (id: string) => travel.participants.find((p) => p.itemId === itemId && p.memberId === id)?.status;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.top}><View style={styles.back} /><Text style={styles.title}>Invite people</Text><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 6 }}>
          {others.length === 0 && <Text style={styles.note}>No one else is on this trip yet.</Text>}
          {others.map((m) => {
            const status = statusOf(m.id), already = status === "invited" || status === "going", on = already || picked.includes(m.id);
            return <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: already }} disabled={already}
              onPress={() => setPicked((list) => list.includes(m.id) ? list.filter((x) => x !== m.id) : [...list, m.id])} style={styles.inviteRow}>
              <Avatar name={m.name} size={34} />
              <Text style={styles.inviteName}>{m.name}{already ? <Text style={styles.note}>  {status === "going" ? "Going" : "Invited"}</Text> : null}</Text>
              <View style={[styles.box, on && styles.on]}>{on && <Text style={styles.onText}>✓</Text>}</View>
            </Pressable>;
          })}
        </ScrollView>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={!picked.length} onPress={() => onSend(picked)} style={[styles.primary, !picked.length && { opacity: 0.4 }]}>
            <Text style={styles.primaryText}>{picked.length > 1 ? `Send ${picked.length} invites` : "Send invite"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** "Flight / Ride or rental car / Lodging / Other plans" — the + Add choices. */
export function AddChoices({ onPick, onClose }: { onPick: (kind: TravelKind) => void; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.choices}>
          <Text style={[styles.title, { textAlign: "left" }]}>Add to my travel</Text>
          {ADDABLE.map(({ kind, label }) => <Pressable key={kind} accessibilityRole="button" onPress={() => onPick(kind)} style={styles.choiceRow}><Text style={styles.choiceRowText}>{label}</Text></Pressable>)}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.choiceRow}><Text style={[styles.choiceRowText, { color: colors.boardInk }]}>Cancel</Text></Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export function Field({ label, value, onChange, placeholder, problem, upper = false, number = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; problem?: string; upper?: boolean; number?: boolean }) {
  return <View style={{ flex: 1, gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.searchFaint} accessibilityLabel={label}
      autoCapitalize={upper ? "characters" : "sentences"} keyboardType={number ? "number-pad" : "default"} style={[styles.input, !!problem && styles.inputBad]} />
    {problem && <Text style={styles.problem} accessibilityRole="alert">{problem}</Text>}
  </View>;
}

/** A local trip time "YYYY-MM-DDTHH:mm": tap to set (starts on the day being looked at), Clear for optional ones. */
export function WhenField({ label, value, onChange, problem, optional, defaultDay }: { label: string; value: string; onChange: (v: string) => void; problem?: string; optional: boolean; defaultDay?: string }) {
  const [androidStep, setAndroidStep] = useState<"date" | "time" | null>(null);
  const start = value ? fromLocal(value) : defaultDay ? fromLocal(`${defaultDay}T12:00`) : new Date();
  const pick = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") setAndroidStep(androidStep === "date" && event.type === "set" ? "time" : null);
    if (event.type === "set" && date) onChange(toLocal(date));
  };
  return <View style={{ gap: 4 }}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.whenRow}>
      {value || Platform.OS !== "ios" ? null : <Pressable accessibilityRole="button" onPress={() => onChange(toLocal(start))} style={styles.setButton}><Text style={styles.secondaryText}>Set</Text></Pressable>}
      {Platform.OS === "ios" && value ? <DateTimePicker value={start} mode="datetime" display="compact" onChange={pick} accentColor={colors.gold} themeVariant="dark" accessibilityLabel={label} />
        : Platform.OS !== "ios" && <Pressable accessibilityRole="button" onPress={() => setAndroidStep("date")}><Text style={styles.whenText}>{value ? value.replace("T", " ") : "Set"}</Text></Pressable>}
      {optional && value ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => onChange("")}><Text style={styles.clear}>Clear</Text></Pressable> : null}
    </View>
    {androidStep && <DateTimePicker value={start} mode={androidStep} onChange={pick} />}
    {problem && <Text style={styles.problem} accessibilityRole="alert">{problem}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  back: { width: minTap, height: minTap, justifyContent: "center" },
  backText: { fontFamily: fonts.regular, fontSize: 32, color: colors.cream },
  title: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  input: { minHeight: 46, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.inputOnMaroon, color: colors.cream, fontFamily: fonts.regular, fontSize: 16 },
  inputBad: { borderColor: colors.errorOnMaroon },
  problem: { fontFamily: fonts.semibold, fontSize: 12, color: colors.errorOnMaroon },
  pair: { flexDirection: "row", gap: 10 },
  choice: { flexDirection: "row", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, padding: 3 },
  choiceItem: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  choiceText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  on: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  onText: { color: colors.maroon900, fontFamily: fonts.bold },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  whenText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  setButton: { minHeight: 38, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, justifyContent: "center" },
  clear: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardLink },
  actions: { flexDirection: "row", gap: 10, padding: gutter },
  secondary: { flex: 1, minHeight: 50, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  primary: { flex: 1, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.maroon900 },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54 },
  inviteName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  choices: { padding: gutter, paddingBottom: 36, gap: 4, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, backgroundColor: colors.maroon900 },
  choiceRow: { minHeight: 52, justifyContent: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  choiceRowText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
});
