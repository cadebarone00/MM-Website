import { useEffect, useState } from "react";
import { Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { PLACES_CREDIT } from "@/lib/platform/placeAreas";
import { distanceLabel, distanceMiles, mapsLink, PLACE_CATEGORIES, placeBadge, rankPlaces, type Place, type PlaceCategory } from "@/lib/platform/venuePlaces";
import { SheetClose } from "~/components/SheetClose.tsx";
import { apiRaw } from "~/lib/api.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Center = { latitude: number; longitude: number };
type Live = { status: "loading" } | { status: "no-destination" } | { status: "off" } | { status: "error" } | { status: "ok"; places: (Place & { savedByMe?: boolean })[]; pending: PlaceCategory[] };
const ICONS: Record<PlaceCategory, "fork.knife" | "mug.fill" | "flag.fill" | "cup.and.saucer.fill" | "ticket.fill"> = { food: "fork.knife", bars: "mug.fill", golf: "flag.fill", coffee: "cup.and.saucer.fill", todo: "ticket.fill" };
const DEFAULT_FILTERS = { location: "", miles: "", minimum: "", savedOnly: false, sort: "recommended" as "recommended" | "nearest" | "rating" };
const toggle = (list: string[], id: string) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
const centerOf = (places: Place[]): Center | null => places.length ? { latitude: places.reduce((s, p) => s + p.latitude, 0) / places.length, longitude: places.reduce((s, p) => s + p.longitude, 0) / places.length } : null;

/**
 * The trip's Venue tab in the app (website VenuePlaces for a saved trip, project_specs.md Golf Trips part 2f): the trip's
 * recommended places from /api/golf-trips/<trip>/places — search, categories, filters, cards with distance, heart (saved
 * for the group), badge, Maroon Rating, Add to itinerary and Open in Maps (Apple Maps on iPhone). Same ranking and maths as
 * the website (lib/platform/venuePlaces.ts).
 */
export function TripVenue({ tripId, destination, center, onAddToItinerary }: {
  tripId: string; destination: string; center: Center | null; onAddToItinerary?: (place: Place, done: () => void) => void;
}) {
  const [live, setLive] = useState<Live>({ status: "loading" });
  const [saved, setSaved] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtering, setFiltering] = useState(false);

  const load = async () => {
    const reply = await apiRaw<{ status?: string; places?: (Place & { savedByMe?: boolean })[]; pending?: PlaceCategory[] }>(`/api/golf-trips/${encodeURIComponent(tripId)}/places`);
    if (reply.status === 503) return setLive({ status: "off" });
    if (reply.status !== 200 || !reply.body) return setLive({ status: "error" });
    if (reply.body.status === "no-destination") return setLive({ status: "no-destination" });
    setLive({ status: "ok", places: reply.body.places ?? [], pending: reply.body.pending ?? [] });
    setSaved((reply.body.places ?? []).filter((p) => p.savedByMe).map((p) => p.id));
  };
  useEffect(() => { void load(); }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps -- loads once per trip

  // The heart answers at once and saves in the background; if saving fails it flips back.
  const save = (place: Place) => {
    const on = !saved.includes(place.id);
    setSaved((list) => toggle(list, place.id));
    void apiRaw<{ ok?: boolean }>(`/api/golf-trips/${encodeURIComponent(tripId)}/places/${place.id}`, { method: "PUT", body: { saved: on } })
      .then((r) => { if (r.status !== 200) setSaved((list) => on ? list.filter((id) => id !== place.id) : [...list, place.id]); });
  };
  const add = (place: Place) => onAddToItinerary?.(place, () => {
    setAdded((list) => list.includes(place.id) ? list : [...list, place.id]);
    void apiRaw(`/api/golf-trips/${encodeURIComponent(tripId)}/places/${place.id}`, { method: "POST" }); // only counts "Added by N trips"
  });

  const places = live.status === "ok" ? live.places : [];
  const origin = places.find((p) => p.id === filters.location) ?? center ?? centerOf(places) ?? { latitude: 0, longitude: 0 };
  const placeName = destination.split(",").slice(0, 2).join(",").trim() || "Destination TBD";
  const term = query.trim().toLowerCase();
  const active = category !== null || JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const shown = rankPlaces(places.map((p) => ({ ...p, savedByGroup: p.savedByGroup || saved.includes(p.id) })), origin).filter((p) => (!category || p.category === category)
    && (!term || `${p.name} ${p.detail ?? ""}`.toLowerCase().includes(term))
    && (!filters.miles || distanceMiles(origin, p) <= Number(filters.miles))
    && (!filters.minimum || ((p.ratingCount ?? 0) > 0 && (p.ratingAverage ?? 0) / 2 >= Number(filters.minimum)))
    && (!filters.savedOnly || p.savedByGroup));
  if (filters.sort === "nearest") shown.sort((a, b) => distanceMiles(origin, a) - distanceMiles(origin, b));
  if (filters.sort === "rating") shown.sort((a, b) => ((b.ratingCount ?? 0) > 0 ? b.ratingAverage ?? 0 : -1) - ((a.ratingCount ?? 0) > 0 ? a.ratingAverage ?? 0 : -1));
  const everythingPending = live.status === "ok" && places.length === 0 && live.pending.length === PLACE_CATEGORIES.length;

  const body = live.status === "no-destination" ? <Message title="No destination yet" text="Once the organizer sets where the trip is, places to eat, drink and play show up here." />
    : live.status === "off" ? <Message title="Places are coming soon" text="Recommended spots for this trip will show up here." />
    : live.status === "error" ? <Message title="Couldn't load places" text="Check your connection and pull down to try again." />
    : live.status === "loading" ? <Message title="Loading places…" text="" />
    : shown.length === 0 ? (everythingPending && !term && !active ? <Message title="Finding places" text="We're gathering spots near your trip. They'll be here within a day." />
      : <Message title="No places found" text={active ? "Try a wider distance or reset your filters." : "Try another name."} />)
    : shown.map((p) => {
      const isSaved = saved.includes(p.id), isAdded = added.includes(p.id);
      const badge = placeBadge(p);
      const rating = (p.ratingCount ?? 0) > 0 && Number.isFinite(p.ratingAverage) ? Math.round(Math.max(0, Math.min(5, p.ratingAverage! / 2)) * 10) / 10 : null;
      return <View key={p.id} style={styles.card} accessibilityLabel={p.name}>
        <View style={styles.picture}>
          <SymbolView name={ICONS[p.category]} size={40} tintColor={colors.boardGold} />
          <Text style={styles.distance}>{distanceLabel(distanceMiles(origin, p))}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: isSaved }} accessibilityLabel={isSaved ? `Unsave ${p.name}` : `Save ${p.name}`} onPress={() => save(p)} style={styles.heart}>
            <SymbolView name={isSaved ? "heart.fill" : "heart"} size={20} tintColor={isSaved ? colors.errorOnMaroon : colors.cream} />
          </Pressable>
        </View>
        <View style={{ padding: 12, gap: 4 }}>
          <Text style={styles.name}>{p.name}</Text>
          {p.address && <Text style={styles.line}>{p.address}</Text>}
          {p.detail && <Text style={styles.line}>{p.detail}</Text>}
          {badge && badge !== "Ranked highly by Maroon users" && <Text style={styles.badge}>{badge}</Text>}
          <Text style={styles.line} accessibilityLabel={rating === null ? "Maroon Rating: not yet rated" : `Maroon Rating: ${rating.toFixed(1)} out of 5 stars`}>
            Maroon Rating <Text style={styles.stars}>{[0, 1, 2, 3, 4].map((i) => (rating ?? 0) - i >= 0.5 ? "★" : "☆").join("")}</Text> {rating === null ? "?" : rating.toFixed(1)}
          </Text>
          <View style={styles.actions}>
            {onAddToItinerary && <Pressable accessibilityRole="button" accessibilityState={{ selected: isAdded }} onPress={() => add(p)} style={[styles.addButton, isAdded && styles.added]}>
              <Text style={styles.addText}>{isAdded ? "✓ Added" : "+ Add to itinerary"}</Text></Pressable>}
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(mapsLink(p, Platform.OS === "ios"))} style={styles.mapsButton}><Text style={styles.mapsText}>Open in Maps</Text></Pressable>
          </View>
        </View>
      </View>;
    });

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: 12 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.goldBright} />}>
      <View style={styles.searchRow}>
        <TextInput value={query} onChangeText={setQuery} placeholder={`Search places in ${placeName}`} placeholderTextColor={colors.searchFaint} style={styles.search} accessibilityLabel={`Search places in ${placeName}`} />
        <Pressable accessibilityRole="button" accessibilityLabel="Filter places" onPress={() => setFiltering(true)} style={[styles.filter, active && styles.filterOn]}>
          <SymbolView name="slider.horizontal.3" size={20} tintColor={active ? colors.maroon900 : colors.cream} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: gutter }} accessibilityLabel="Categories">
        {PLACE_CATEGORIES.map(({ key, label }) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: category === key }} onPress={() => setCategory(category === key ? null : key)} style={styles.category}>
          <View style={[styles.circle, category === key && styles.circleOn]}><SymbolView name={ICONS[key]} size={22} tintColor={category === key ? colors.maroon900 : colors.cream} /></View>
          <Text style={styles.categoryLabel} numberOfLines={2}>{label}</Text>
        </Pressable>)}
      </ScrollView>
      <View style={{ paddingHorizontal: gutter, gap: 12 }}>{body}</View>
      <Text style={styles.credit}>{PLACES_CREDIT}</Text>
      {filtering && <Filters places={places} placeName={placeName} filters={filters} category={category} onClose={() => setFiltering(false)}
        onApply={(f, c) => { setFilters(f); setCategory(c); setFiltering(false); }} />}
    </ScrollView>
  );
}

function Filters({ places, placeName, filters, category, onApply, onClose }: { places: Place[]; placeName: string; filters: typeof DEFAULT_FILTERS; category: PlaceCategory | null; onApply: (f: typeof DEFAULT_FILTERS, c: PlaceCategory | null) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(filters);
  const [cat, setCat] = useState(category);
  const chips = <T extends string>(items: [T, string][], value: T, set: (v: T) => void) => <View style={styles.chips}>
    {items.map(([v, label]) => <Pressable key={v || "any"} accessibilityRole="radio" accessibilityState={{ checked: value === v }} onPress={() => set(v)} style={[styles.chip, value === v && styles.chipOn]}>
      <Text style={[styles.chipText, value === v && styles.chipTextOn]}>{label}</Text></Pressable>)}
  </View>;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.sheetTop}><Text style={styles.sheetTitle}>Filters</Text><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Location</Text>
          {chips<string>([["", `Trip area · ${placeName.split(",")[0]}`], ...places.slice(0, 12).map((p): [string, string] => [p.id, `Near ${p.name}`])], draft.location, (location) => setDraft({ ...draft, location }))}
          <Text style={styles.label}>Within miles</Text>
          <TextInput value={draft.miles} onChangeText={(miles) => setDraft({ ...draft, miles: miles.replace(/[^0-9.]/g, "") })} placeholder="Any distance" placeholderTextColor={colors.searchFaint} keyboardType="decimal-pad" style={styles.search} accessibilityLabel="Within miles" />
          <Text style={styles.line}>Straight-line distance from your selected location, using places available for this trip.</Text>
          <Text style={styles.label}>Category</Text>
          {chips<string>([["", "All"], ...PLACE_CATEGORIES.map((c): [string, string] => [c.key, c.label])], cat ?? "", (v) => setCat((v || null) as PlaceCategory | null))}
          <Text style={styles.label}>Minimum Maroon Rating</Text>
          {chips<string>([["", "Any"], ...[3, 3.5, 4, 4.5].map((n): [string, string] => [String(n), `${n.toFixed(1)}+`])], draft.minimum, (minimum) => setDraft({ ...draft, minimum }))}
          <View style={styles.switchRow}><Text style={styles.switchLabel}>Saved by our group</Text><Switch value={draft.savedOnly} onValueChange={(savedOnly) => setDraft({ ...draft, savedOnly })} trackColor={{ true: colors.goldBright }} /></View>
          <Text style={styles.label}>Sort by</Text>
          {chips<typeof draft.sort>([["recommended", "Recommended"], ["nearest", "Nearest"], ["rating", "Highest rating"]], draft.sort, (sort) => setDraft({ ...draft, sort }))}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={() => { setDraft(DEFAULT_FILTERS); setCat(null); }} style={styles.mapsButton}><Text style={styles.mapsText}>Reset</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => onApply(draft, cat)} style={styles.addButton}><Text style={styles.addText}>Apply filters</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return <View style={styles.message}><Text style={styles.name}>{title}</Text>{!!text && <Text style={[styles.line, { textAlign: "center" }]}>{text}</Text>}</View>;
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: 10, paddingHorizontal: gutter, marginTop: 14 },
  search: { flex: 1, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.searchField, color: colors.searchInk, fontFamily: fonts.regular, fontSize: 15 },
  filter: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.boardBorderSoft, alignItems: "center", justifyContent: "center" },
  filterOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  category: { width: 72, alignItems: "center", gap: 6 },
  circle: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  circleOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  categoryLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.boardInk, textAlign: "center" },
  card: { borderRadius: radius.card, overflow: "hidden", borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  picture: { height: 120, alignItems: "center", justifyContent: "center", backgroundColor: colors.boardTop },
  distance: { position: "absolute", left: 10, bottom: 8, fontFamily: fonts.semibold, fontSize: 12, color: colors.cream },
  heart: { position: "absolute", right: 6, top: 6, width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  line: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  badge: { fontFamily: fonts.semibold, fontSize: 12, color: colors.goldBright },
  stars: { color: colors.goldBright, letterSpacing: 1 },
  actions: { flexDirection: "row", gap: 8, marginTop: 6 },
  addButton: { flex: 1, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  added: { opacity: 0.75 },
  addText: { fontFamily: fonts.bold, fontSize: 14, color: colors.maroon900 },
  mapsButton: { flex: 1, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  mapsText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  message: { alignItems: "center", gap: 6, paddingVertical: 32 },
  credit: { textAlign: "center", fontFamily: fonts.regular, fontSize: 11, color: colors.boardInk },
  page: { flex: 1, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, justifyContent: "center" },
  chipOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  chipTextOn: { color: colors.maroon900 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  footer: { flexDirection: "row", gap: 10, padding: gutter },
});
