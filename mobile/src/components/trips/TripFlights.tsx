import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FLIGHT_DIRECTIONS, flightInputFromBody, flightTime, groupFlights, type FlightDirection, type GolfTripFlight } from "@/lib/platform/golfTripFlights";
import { SheetClose } from "~/components/SheetClose.tsx";
import { apiRaw } from "~/lib/api.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";
import { Field, WhenField } from "./TripTravelForm.tsx";

type Load = { status: "loading" } | { status: "off" } | { status: "error"; message: string } | { status: "ok" };

/**
 * Home → Flights in the app (website GolfTripFlights, project_specs.md Golf Trips part 2f): my own flights on this trip,
 * grouped Getting There / Heading Home, with add / edit / delete. Loads GET /api/golf-trips/<trip>/flights and saves through
 * the same POST / DELETE the website uses; the same checks as the server (`flightInputFromBody`) run before Save. Only I can
 * see them. Manual data only (no flight-status provider yet).
 */
export function TripFlights({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [flights, setFlights] = useState<GolfTripFlight[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [editing, setEditing] = useState<{ flight: GolfTripFlight | null; direction: FlightDirection } | null>(null);
  useEffect(() => {
    void apiRaw<{ ok?: boolean; flights?: GolfTripFlight[]; error?: string }>(`/api/golf-trips/${encodeURIComponent(tripId)}/flights`).then((r) => {
      if (r.status === 200 && r.body?.ok) { setFlights(r.body.flights ?? []); setLoad({ status: "ok" }); }
      else if (r.status === 503) setLoad({ status: "off" });
      else setLoad({ status: "error", message: r.status === 0 ? "You're offline. Open Flights again when you're back online." : r.body?.error ?? "Couldn't load your flights." });
    });
  }, [tripId]);
  const groups = groupFlights(flights);
  const remove = (flight: GolfTripFlight) => Alert.alert("Delete this flight?", `${flight.flightNumber} ${flight.departureAirport} → ${flight.arrivalAirport}`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: async () => {
      const r = await apiRaw<{ ok?: boolean; error?: string }>(`/api/golf-trips/${encodeURIComponent(tripId)}/flights/${flight.id}`, { method: "DELETE" });
      if (r.status === 200 && r.body?.ok) setFlights((list) => list.filter((f) => f.id !== flight.id));
      else Alert.alert("Not deleted", r.status === 0 ? "We couldn't reach the server. Check your connection and try again." : r.body?.error ?? "We couldn't delete this flight. Try again.");
    } }]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.top}><Text style={styles.title}>Flights</Text><SheetClose onPress={onClose} /></View>
        <Text style={styles.note}>Only you can see your flights. Times are the local times on your ticket.</Text>
        {editing ? <FlightForm tripId={tripId} editing={editing} onCancel={() => setEditing(null)}
          onSaved={(flight) => { setFlights((list) => [...list.filter((f) => f.id !== flight.id), flight]); setEditing(null); }} />
          : <ScrollView contentContainerStyle={{ padding: gutter, gap: 14 }}>
            {load.status === "loading" && <Text style={styles.note}>Loading your flights…</Text>}
            {load.status === "off" && <View style={styles.card}><Text style={styles.cardTitle}>Flights</Text><Text style={styles.muted}>Saving flights isn't switched on yet.</Text></View>}
            {load.status === "error" && <Text style={styles.error}>{load.message}</Text>}
            {load.status === "ok" && FLIGHT_DIRECTIONS.map(({ value, label }) => <View key={value} style={styles.card} accessibilityLabel={label}>
              <Text style={styles.cardTitle}>{label}</Text>
              {groups[value].length === 0 && <Text style={styles.muted}>{value === "arrival" ? "Add the flights that get you there" : "Add the flights that bring you home"}</Text>}
              {groups[value].map((f) => <View key={f.id} style={styles.flight} accessibilityLabel={`${f.flightNumber} ${f.departureAirport} to ${f.arrivalAirport}`}>
                <Text style={styles.flightName}>{f.flightNumber} · {f.airline}</Text>
                <Text style={styles.route}>{f.departureAirport} → {f.arrivalAirport}</Text>
                <Row label="Departs" value={flightTime(f.departureLocal)} /><Row label="Arrives" value={flightTime(f.arrivalLocal)} />
                {f.confirmationNumber && <Row label="Confirmation" value={f.confirmationNumber} />}
                {f.notes && <Text style={styles.muted}>{f.notes}</Text>}
                {[f.liveStatus, f.departureTerminal && `Terminal ${f.departureTerminal}`, f.departureGate && `Gate ${f.departureGate}`].filter(Boolean).length > 0 &&
                  <Text style={styles.muted}>{[f.liveStatus, f.departureTerminal && `Terminal ${f.departureTerminal}`, f.departureGate && `Gate ${f.departureGate}`].filter(Boolean).join(" · ")}</Text>}
                <View style={styles.buttons}>
                  <Pressable accessibilityRole="button" onPress={() => setEditing({ flight: f, direction: f.direction })} style={styles.secondary}><Text style={styles.secondaryText}>Edit</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => remove(f)} style={[styles.secondary, { borderColor: colors.errorOnMaroon }]}><Text style={[styles.secondaryText, { color: colors.errorOnMaroon }]}>Delete</Text></Pressable>
                </View>
              </View>)}
              <Pressable accessibilityRole="button" onPress={() => setEditing({ flight: null, direction: value })} style={styles.add}><Text style={styles.addText}>+ Add flight</Text></Pressable>
            </View>)}
          </ScrollView>}
      </SafeAreaView>
    </Modal>
  );
}

function FlightForm({ tripId, editing, onSaved, onCancel }: { tripId: string; editing: { flight: GolfTripFlight | null; direction: FlightDirection }; onSaved: (f: GolfTripFlight) => void; onCancel: () => void }) {
  const f = editing.flight;
  const [v, setV] = useState({ direction: editing.direction, airline: f?.airline ?? "", flightNumber: f?.flightNumber ?? "", departureAirport: f?.departureAirport ?? "", arrivalAirport: f?.arrivalAirport ?? "",
    departureLocal: f?.departureLocal ?? "", arrivalLocal: f?.arrivalLocal ?? "", confirmationNumber: f?.confirmationNumber ?? "", notes: f?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key: keyof typeof v) => (value: string) => setV((cur) => ({ ...cur, [key]: value }));
  const save = async () => {
    const checked = flightInputFromBody({ ...v, id: f?.id ?? "" });
    if (!checked.ok) return setMessage(checked.errors[0].message);
    setBusy(true); setMessage("");
    const r = await apiRaw<{ ok?: boolean; flight?: GolfTripFlight; error?: string }>(`/api/golf-trips/${encodeURIComponent(tripId)}/flights`, { method: "POST", body: checked.flight });
    setBusy(false);
    if ((r.status === 200 || r.status === 201) && r.body?.ok && r.body.flight) return onSaved(r.body.flight);
    setMessage(r.status === 0 ? "We couldn't reach the server. Check your connection and try again." : r.body?.error ?? "We couldn't save your flight. Try again.");
  };
  return (
    <ScrollView contentContainerStyle={{ padding: gutter, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.cardTitle}>{f ? "Edit flight" : "Add flight"}</Text>
      <View style={styles.choice} accessibilityRole="radiogroup" accessibilityLabel="Which way">
        {FLIGHT_DIRECTIONS.map(({ value, label }) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: v.direction === value }} onPress={() => setV({ ...v, direction: value })}
          style={[styles.choiceItem, v.direction === value && styles.on]}><Text style={[styles.choiceText, v.direction === value && styles.onText]}>{label}</Text></Pressable>)}
      </View>
      <Field label="Airline" value={v.airline} onChange={set("airline")} placeholder="American Airlines" />
      <Field label="Flight number" value={v.flightNumber} onChange={set("flightNumber")} placeholder="AA1234" upper />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="From" value={v.departureAirport} onChange={set("departureAirport")} placeholder="DFW" upper />
        <Field label="To" value={v.arrivalAirport} onChange={set("arrivalAirport")} placeholder="RDU" upper />
      </View>
      <WhenField label="Departs (local time)" value={v.departureLocal} onChange={set("departureLocal")} optional={false} />
      <WhenField label="Arrives (local time)" value={v.arrivalLocal} onChange={set("arrivalLocal")} optional={false} defaultDay={v.departureLocal.slice(0, 10) || undefined} />
      <Field label="Confirmation number (optional)" value={v.confirmationNumber} onChange={set("confirmationNumber")} placeholder="ABC123" upper />
      <View style={{ gap: 4 }}><Text style={styles.label}>Notes (optional)</Text>
        <TextInput value={v.notes} onChangeText={set("notes")} multiline maxLength={500} style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} accessibilityLabel="Notes" /></View>
      {!!message && <Text style={styles.error} accessibilityRole="alert">{message}</Text>}
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Saving…" : "Save"}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.muted}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  note: { paddingHorizontal: gutter, fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.errorOnMaroon },
  card: { padding: 14, gap: 10, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  flight: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  flightName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  route: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  buttons: { flexDirection: "row", gap: 10, marginTop: 6 },
  secondary: { flex: 1, minHeight: 42, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  primary: { flex: 1, minHeight: 42, borderRadius: radius.pill, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bold, fontSize: 14, color: colors.maroon900 },
  add: { minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  addText: { fontFamily: fonts.bold, fontSize: 14, color: colors.goldBright },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  input: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.inputOnMaroon, color: colors.cream, fontFamily: fonts.regular, fontSize: 15 },
  choice: { flexDirection: "row", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, padding: 3 },
  choiceItem: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  choiceText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  on: { backgroundColor: colors.goldBright },
  onText: { color: colors.maroon900, fontFamily: fonts.bold },
});
