import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { shortTripDate } from "@/lib/platform/golfTripDraft";
import type { PlaceLocation, PlaceSuggestion } from "@/lib/platform/location/types";
import { apiJson } from "~/lib/api.ts";
import { monthGrid, monthTitle, rangeTap, type DayRange } from "~/lib/tripBuilderUi.ts";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

const tick = () => { Haptics.selectionAsync().catch(() => {}); };

/** One Trip Builder question as a column of picks (website TripChoice): the chosen one turns gold. Tap again to clear. */
export function TripChoice({ question, options, value, onChange }: { question: string; options: readonly { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.choice} accessibilityRole="radiogroup" accessibilityLabel={question}>
      <Text style={styles.question}>{question}</Text>
      {options.map((option) => (
        <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: value === option.value }} onPress={() => { tick(); onChange(value === option.value ? "" : option.value); }}
          style={[styles.option, value === option.value && styles.optionOn]}>
          <Text style={[styles.optionText, value === option.value && styles.optionTextOn]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Destination (website DestinationSearch): type 3+ letters, Google Places suggestions drop down a moment later; picking
 * one keeps its place id and map position with the trip. A typed destination that wasn't picked still saves as text.
 */
export function DestinationField({ value, onChange }: { value: string; onChange: (text: string, place: PlaceLocation | null) => void }) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [picked, setPicked] = useState(false);
  const session = useRef("");
  const off = useRef(false);

  useEffect(() => {
    const query = text.trim();
    if (picked || off.current || query.length < 3 || query === value.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      session.current ||= Crypto.randomUUID();
      const reply = await apiJson<{ suggestions?: PlaceSuggestion[] }>(`/api/places/autocomplete?q=${encodeURIComponent(query)}&session=${session.current}`, { signal: controller.signal });
      if (!reply.ok && reply.code === "aborted") return;
      if (!reply.ok && reply.code === "unavailable") off.current = true;
      setSuggestions(reply.ok && Array.isArray(reply.body.suggestions) ? reply.body.suggestions : []);
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text, picked, value]);

  function type(next: string) {
    setText(next);
    setPicked(false);
    onChange(next, null);
    if (next.trim().length < 3) setSuggestions([]);
  }
  async function pick(suggestion: PlaceSuggestion) {
    setText(suggestion.text);
    setSuggestions([]);
    setPicked(true);
    onChange(suggestion.text, null);
    const token = session.current;
    session.current = "";
    const reply = await apiJson<{ place?: PlaceLocation }>(`/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&session=${token}`);
    if (reply.ok && reply.body.place) onChange(suggestion.text, reply.body.place);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Destination</Text>
      <TextInput value={text} onChangeText={type} placeholder="Pinehurst, North Carolina" placeholderTextColor={colors.wizardDisabledInk}
        autoCorrect={false} accessibilityLabel="Destination" style={styles.input} />
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable key={s.placeId} accessibilityRole="button" onPress={() => void pick(s)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
              <SymbolView name="mappin.circle" size={18} tintColor={colors.avatarGold} />
              <View style={styles.flex}>
                <Text style={styles.suggestionMain}>{s.mainText}</Text>
                <Text style={styles.suggestionSub} numberOfLines={1}>{s.text}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** Start and End in one calendar (website DateRangePicker): tap the first day, then the last; swipe months with ‹ ›. */
export function DateRangeCalendar({ start, end, onChange }: { start: string; end: string; onChange: (range: DayRange) => void }) {
  const base = start ? new Date(`${start}T12:00:00`) : new Date();
  const [month, setMonth] = useState({ year: base.getFullYear(), month: base.getMonth() });
  const range: DayRange = { start: start || null, end: end || null };
  const shift = (delta: number) => setMonth(({ year, month: m }) => { const d = new Date(year, m + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const cells = monthGrid(month.year, month.month);
  return (
    <View style={styles.calendarWrap}>
      <View style={styles.twoUp}>
        <View style={[styles.field, styles.flex]}><Text style={styles.label}>Start Date</Text><Text style={styles.dateValue}>{start ? shortTripDate(start) : "Pick a day"}</Text></View>
        <View style={[styles.field, styles.flex]}><Text style={styles.label}>End Date</Text><Text style={styles.dateValue}>{end ? shortTripDate(end) : start ? "Pick the last day" : "—"}</Text></View>
      </View>
      <View style={styles.calendar}>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shift(-1)} style={styles.monthArrow}><SymbolView name="chevron.left" size={16} tintColor={colors.cream} /></Pressable>
          <Text style={styles.monthTitle}>{monthTitle(month.year, month.month)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shift(1)} style={styles.monthArrow}><SymbolView name="chevron.right" size={16} tintColor={colors.cream} /></Pressable>
        </View>
        <View style={styles.week}>{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} style={styles.weekday}>{d}</Text>)}</View>
        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const isEdge = day === range.start || day === range.end;
            const inside = range.start && range.end && day > range.start && day < range.end;
            return (
              <Pressable key={i} accessibilityRole="button" accessibilityLabel={shortTripDate(day)} accessibilityState={{ selected: Boolean(isEdge || inside) }}
                onPress={() => { tick(); onChange(rangeTap(range, day)); }} style={styles.cell}>
                <View style={[styles.dayDot, inside && styles.dayInside, isEdge && styles.dayEdge]}>
                  <Text style={[styles.dayText, isEdge && styles.dayTextEdge]}>{Number(day.slice(8))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** − / + with the number in the middle (website counter): golf days. */
export function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.question}>{label}</Text>
      <View style={styles.counterRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`One less: ${label}`} disabled={value <= min} onPress={() => { tick(); onChange(value - 1); }} style={[styles.counterButton, value <= min && styles.off]}>
          <SymbolView name="minus" size={18} tintColor={colors.cream} />
        </Pressable>
        <Text style={styles.counterValue} accessibilityLiveRegion="polite">{value}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`One more: ${label}`} disabled={value >= max} onPress={() => { tick(); onChange(value + 1); }} style={[styles.counterButton, value >= max && styles.off]}>
          <SymbolView name="plus" size={18} tintColor={colors.cream} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  off: { opacity: 0.4 },
  choice: { gap: 8 },
  question: { fontFamily: fonts.semibold, fontSize: 20, color: colors.white },
  option: { minHeight: 52, justifyContent: "center", paddingHorizontal: 16, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  optionOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  optionText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.cream },
  optionTextOn: { color: colors.maroon900 },
  field: { gap: 2, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  label: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  input: { minHeight: 28, padding: 0, fontFamily: fonts.semibold, fontSize: 17, color: colors.cream },
  suggestions: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.wizardLine },
  suggestion: { minHeight: minTap + 4, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  suggestionMain: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  suggestionSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.wizardMuted },
  calendarWrap: { gap: 10 },
  twoUp: { flexDirection: "row", gap: 8 },
  dateValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  calendar: { padding: 12, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  monthArrow: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  week: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.semibold, fontSize: 12, color: colors.wizardMuted, paddingBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayInside: { backgroundColor: "rgba(201,168,110,0.22)" },
  dayEdge: { backgroundColor: colors.gold },
  dayText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  dayTextEdge: { color: colors.maroon900 },
  counter: { gap: 10 },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  counterButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  counterValue: { minWidth: 48, textAlign: "center", fontFamily: fonts.bold, fontSize: 36, color: colors.white },
});
