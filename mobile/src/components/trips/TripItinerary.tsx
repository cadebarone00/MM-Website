import { useMemo, useState } from "react";
import { Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { LinearGradient } from "expo-linear-gradient";
import { SymbolView } from "expo-symbols";
import { itineraryByDay, itineraryCategory, itineraryLongDate, itineraryTime, itineraryWeekday, localNow, withGolfRounds, type ItineraryItem } from "@/lib/platform/golfTripItinerary";
import { itineraryFor, type TravelItem, type TravelKind } from "@/lib/platform/tripTravel";
import { SheetClose } from "~/components/SheetClose.tsx";
import type { useTripPlans } from "~/lib/useTripPlans.ts";
import { useTripScroll } from "~/lib/tripScroll.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";
import { AddChoices, InvitePeople, TripTravelForm } from "./TripTravelForm.tsx";

type Plans = ReturnType<typeof useTripPlans>;
type Rsvp = "in" | "out";
const RSVP_KEY = "golfTripRoundRsvp";
/** Play / Sit out per round, on this phone only (the website keeps it on the device too until it's saved with the trip). */
const readRsvps = (trip: string): Record<string, Rsvp> => { try { return (JSON.parse(SecureStore.getItem(RSVP_KEY) ?? "{}") as Record<string, Record<string, Rsvp>>)[trip] ?? {}; } catch { return {}; } };
const writeRsvp = (trip: string, round: number, choice: Rsvp) => {
  try { const all = JSON.parse(SecureStore.getItem(RSVP_KEY) ?? "{}") as Record<string, Record<string, Rsvp>>; SecureStore.setItem(RSVP_KEY, JSON.stringify({ ...all, [trip]: { ...all[trip], [round]: choice } })); } catch { /* kept for this visit */ }
};

/**
 * The trip's Itinerary tab in the app (website ItineraryList, project_specs.md Golf Trips part 2f): one day at a time
 * (< weekday / date >, opens on today), that day's plans in time order grouped by type. Golf rounds: Play / Sit out until
 * the tee time; invites: Accept / Decline; tap a plan for its sheet (Open in Maps, Edit / Delete my own); + Add a flight,
 * ride, lodging or other plan. Saved through useTripPlans (my plans on my account).
 */
export function TripItinerary({ tripId, plans, rounds, tripDays, activeRound, refreshing, onRefresh }: {
  tripId: string; plans: Plans; rounds: { number: number; date: string; course: string }[]; tripDays: string[]; activeRound?: number; refreshing: boolean; onRefresh: () => void;
}) {
  const { travel, change, status } = plans;
  const tripScroll = useTripScroll(); // tucks the trip header away while scrolling down
  const items = useMemo(() => withGolfRounds(itineraryFor(travel), rounds), [travel, rounds]);
  const days = itineraryByDay(items, tripDays);
  const [now] = useState(() => localNow(new Date()));
  const [picked, setPicked] = useState<number | null>(null);
  const [rsvps, setRsvps] = useState(() => readRsvps(tripId));
  const [open, setOpen] = useState<ItineraryItem | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [form, setForm] = useState<{ kind: TravelKind; item?: TravelItem } | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const today = days.findIndex(({ day }) => day === now.slice(0, 10));
  const index = days.length ? Math.min(days.length - 1, picked ?? Math.max(0, today)) : 0;
  const day = days[index];
  const mine = (id: string) => travel.items.find((i) => i.id === id.split(":")[0] && i.source === "mine" && i.createdBy === travel.meId);
  const goingWith = (id: string) => travel.participants.filter((p) => p.itemId === id.split(":")[0] && p.status === "going").map((p) => travel.members.find((m) => m.id === p.memberId)?.name ?? "").filter(Boolean);
  const setRsvp = (round: number, choice: Rsvp) => { writeRsvp(tripId, round, choice); setRsvps((r) => ({ ...r, [round]: choice })); };

  return (
    <ScrollView onScroll={tripScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.goldBright} />}>
      {day ? <View style={styles.dayHead} accessibilityLabel={`${itineraryWeekday(day.day)}, ${itineraryLongDate(day.day)}`}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" disabled={index === 0} onPress={() => setPicked(index - 1)} style={styles.step}><SymbolView name="chevron.left" size={20} weight="semibold" tintColor={colors.cream} style={index === 0 ? styles.hidden : undefined} /></Pressable>
        <View style={{ alignItems: "center" }}><Text style={styles.weekday}>{itineraryWeekday(day.day)}</Text><Text style={styles.date}>{itineraryLongDate(day.day)}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next day" disabled={index >= days.length - 1} onPress={() => setPicked(index + 1)} style={styles.step}><SymbolView name="chevron.right" size={20} weight="semibold" tintColor={colors.cream} style={index >= days.length - 1 ? styles.hidden : undefined} /></Pressable>
      </View> : <View style={styles.card}><Text style={styles.cardTitle}>Itinerary</Text><Text style={styles.muted}>Nothing on the itinerary yet</Text></View>}

      <View style={styles.addRow}>
        {status && <Text style={[styles.muted, { flex: 1 }, status.failed && styles.bad]} accessibilityLiveRegion="polite">{status.text}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Add a plan" onPress={() => setChoosing(true)} hitSlop={8} style={({ pressed }) => [styles.add, pressed && { opacity: 0.8 }]}>
          <SymbolView name="plus" size={13} weight="semibold" tintColor={colors.avatarGold} /><Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      {day && day.items.length === 0 && <Text style={[styles.muted, { marginHorizontal: gutter }]}>Nothing planned for today.</Text>}
      {day?.items.map((item, i) => {
        const round = item.round, invite = item.invite;
        const isLive = round !== undefined && round === activeRound;
        const choice: Rsvp | undefined = round !== undefined ? rsvps[round] ?? "in" : invite ? (invite.status === "going" ? "in" : invite.status === "declined" ? "out" : undefined) : undefined;
        const locked = round !== undefined && now >= (item.timeTbd ? `${item.startsAt.slice(0, 10)}T23:59` : item.startsAt.slice(0, 16));
        const showType = i === 0 || itineraryCategory(day.items[i - 1]) !== itineraryCategory(item);
        return <View key={item.id} style={styles.entry}>
          {showType && <Text style={styles.type}>{itineraryCategory(item)}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={`${itineraryCategory(item)}: ${item.title}, ${item.timeTbd ? "tee time TBD" : itineraryTime(item.startsAt)}`}
            onPress={() => setOpen(item)} style={styles.box}>
            <LinearGradient pointerEvents="none" colors={["rgba(251,248,241,0.12)", "transparent"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
            <View style={[styles.boxTop, choice !== "out" && styles.boxTopLine]}>
              <Text style={styles.boxTime}>{item.timeTbd ? "Tee time TBD" : itineraryTime(item.startsAt)}</Text>
              {round !== undefined && <View style={styles.rsvp} accessibilityLabel={`Round ${round}: play or sit out`}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: choice === "out", disabled: locked }} disabled={locked}
                  onPress={() => { if (choice !== "out") Alert.alert(`Sit out Round ${round}?`, "You'll be taken out of any individual competition for this round. You can change your mind until the tee time.", [
                    { text: "Cancel", style: "cancel" }, { text: "Sit out", style: "destructive", onPress: () => setRsvp(round, "out") }]); }}
                  style={[styles.rsvpButton, styles.sit, choice === "out" && styles.sitOn, locked && styles.dim]}><Text style={[styles.rsvpText, styles.sitText, choice === "out" && styles.rsvpTextOn]}>Sit out</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: choice === "in", disabled: locked }} disabled={locked} onPress={() => setRsvp(round, "in")}
                  style={[styles.rsvpButton, styles.play, choice === "in" && styles.playOn, locked && styles.dim]}><Text style={[styles.rsvpText, styles.playText, choice === "in" && styles.rsvpTextOn]}>Play</Text></Pressable>
              </View>}
              {invite && <View style={styles.rsvp} accessibilityLabel={`Invite from ${invite.from || "a trip member"}: accept or decline`}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: choice === "out" }}
                  onPress={() => { if (choice !== "out") Alert.alert("Decline this invite?", "You can still accept it later.", [{ text: "Cancel", style: "cancel" }, { text: "Decline", style: "destructive", onPress: () => change({ type: "respond", id: invite.itemId, answer: "decline" }) }]); }}
                  style={[styles.rsvpButton, styles.sit, choice === "out" && styles.sitOn]}><Text style={[styles.rsvpText, styles.sitText, choice === "out" && styles.rsvpTextOn]}>Decline</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: choice === "in" }} onPress={() => change({ type: "respond", id: invite.itemId, answer: "accept" })}
                  style={[styles.rsvpButton, styles.play, choice === "in" && styles.playOn]}><Text style={[styles.rsvpText, styles.playText, choice === "in" && styles.rsvpTextOn]}>Accept</Text></Pressable>
              </View>}
            </View>
            {choice !== "out" && <>
              <Text style={styles.boxTitle}>{item.title}</Text>
              {item.detail && <Text style={styles.boxDetail}>{item.detail}</Text>}
              {invite && <Text style={styles.muted}>Invited by {invite.from || "a trip member"}</Text>}
            </>}
            {choice === "in" && <Text style={[styles.tag, isLive && styles.live]}>{isLive ? "Live" : invite ? "Going" : "Playing"}</Text>}
          </Pressable>
        </View>;
      })}

      {open && <PlanSheet item={open} going={goingWith(open.id)} own={mine(open.id)} onClose={() => setOpen(null)}
        onEdit={(item) => { setOpen(null); setForm({ kind: item.kind, item }); }}
        onDelete={(id) => { setOpen(null); change({ type: "remove", id }); }} />}
      {choosing && <AddChoices onClose={() => setChoosing(false)} onPick={(kind) => { setChoosing(false); setForm({ kind }); }} />}
      {form && <TripTravelForm kind={form.kind} item={form.item} defaultDay={day?.day} onClose={() => setForm(null)}
        onBack={form.item ? undefined : () => { setForm(null); setChoosing(true); }}
        onSave={(details, startsAt, endsAt, invite) => {
          const id = form.item?.id ?? `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          if (form.item) change({ type: "update", id, changes: { details, startsAt, endsAt, joinPolicy: form.item.joinPolicy } });
          else change({ type: "add", item: { id, kind: form.kind, details, startsAt, endsAt, joinPolicy: "none" } });
          setForm(null);
          if (invite) setInviting(id);
        }} />}
      {inviting && <InvitePeople travel={travel} itemId={inviting} onClose={() => setInviting(null)} onSend={(memberIds) => { change({ type: "invite", id: inviting, memberIds }); setInviting(null); }} />}
    </ScrollView>
  );
}

/** Tap a plan: what it is, when, who's going, Open in Maps, and Edit / Delete for my own plans. */
function PlanSheet({ item, going, own, onClose, onEdit, onDelete }: { item: ItineraryItem; going: string[]; own: TravelItem | undefined; onClose: () => void; onEdit: (item: TravelItem) => void; onDelete: (id: string) => void }) {
  const category = itineraryCategory(item);
  const query = encodeURIComponent([own?.details.name ?? item.title, own?.details.place].filter(Boolean).join(", "));
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.sheetTop}><Text style={styles.sheetKicker}>{category} · {item.timeTbd ? "Tee time TBD" : itineraryTime(item.startsAt)}</Text><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 12 }}>
          <Text style={styles.sheetTitle}>{item.title}</Text>
          <Tile label="When" value={itineraryWeekday(item.startsAt)} sub={`${itineraryLongDate(item.startsAt)} · ${item.timeTbd ? "Tee time TBD" : itineraryTime(item.startsAt)}${item.endsAt ? ` – ${itineraryTime(item.endsAt)}` : ""}`} />
          <Tile label="Details" value={item.detail || "No details yet"} />
          <Tile label="Who's going" value={going.length ? going.join(", ") : "Just you"} />
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`https://maps.apple.com/?q=${query}`)} style={styles.sheetButton}><Text style={styles.sheetButtonText}>Open in Maps</Text></Pressable>
          {own && <Pressable accessibilityRole="button" onPress={() => onEdit(own)} style={styles.sheetButton}><Text style={styles.sheetButtonText}>Edit plan</Text></Pressable>}
          {own && <Pressable accessibilityRole="button" onPress={() => Alert.alert("Delete this plan?", "It comes off your itinerary.", [{ text: "Keep plan", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => onDelete(own.id) }])}
            style={[styles.sheetButton, { borderColor: colors.errorOnMaroon }]}><Text style={[styles.sheetButtonText, styles.bad]}>Delete plan</Text></Pressable>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <View style={styles.tile}><Text style={styles.tileLabel}>{label}</Text><Text style={styles.tileValue}>{value}</Text>{sub && <Text style={styles.muted}>{sub}</Text>}</View>;
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: gutter, marginTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(214,184,121,0.35)" },
  step: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  hidden: { opacity: 0 },
  weekday: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  date: { marginTop: 3, fontFamily: fonts.capsSemibold, fontSize: 13, letterSpacing: 0.3, color: colors.avatarGold },
  addRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 12, marginHorizontal: gutter, marginTop: 12, marginBottom: 4 },
  add: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.avatarGold },
  addText: { fontFamily: fonts.capsBold, fontSize: 12, color: colors.avatarGold },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  bad: { color: colors.errorOnMaroon },
  card: { marginHorizontal: gutter, marginTop: 16, padding: 14, gap: 6, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  entry: { marginHorizontal: gutter, marginTop: 12 },
  type: { marginTop: 6, marginBottom: 12, paddingBottom: 6, fontFamily: fonts.bold, fontSize: 18, color: colors.cream, borderBottomWidth: 1, borderBottomColor: "rgba(251,248,241,0.35)" },
  box: { gap: 4, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.card, borderWidth: 1, borderColor: "rgba(251,248,241,0.6)", backgroundColor: colors.maroon900, overflow: "hidden" },
  boxTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 24 },
  boxTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  tag: { alignSelf: "flex-end", fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.5, color: colors.tripPlayInk },
  live: { color: colors.tripLive },
  rsvp: { flexDirection: "row", gap: 6 },
  rsvpButton: { height: 24, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: "center" },
  sitOn: { backgroundColor: "#c62828", borderColor: "#c62828" },
  playOn: { backgroundColor: colors.tripPlay, borderColor: colors.tripPlay },
  rsvpText: { fontFamily: fonts.bold, fontSize: 13 },
  dim: { opacity: 0.45 },
  page: { flex: 1, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  sheetKicker: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  tile: { padding: 12, gap: 2, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  tileLabel: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  tileValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  sheetButton: { minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  sheetButtonText: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  boxTopLine: { paddingBottom: 6, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: "rgba(251,248,241,0.22)" },
  boxTime: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  boxDetail: { fontFamily: fonts.capsSemibold, fontSize: 13, color: colors.tripLabel },
  sit: { borderColor: colors.tripSit },
  play: { borderColor: colors.tripPlayInk },
  sitText: { color: colors.tripSit },
  playText: { color: colors.tripPlayInk },
  rsvpTextOn: { color: colors.white },
});
