import { useEffect, useRef, useState } from "react";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COMPARE_DEFAULT, COMPARE_METRICS } from "@/lib/profile/compareMetrics";
import type { RoundStats } from "@/lib/profile/roundStats";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

type Person = { username: string; name: string; friend?: boolean };
type Loaded = { status: "idle" | "loading" } | { status: "ok"; person: Person; stats: RoundStats | null } | { status: "private" | "not_found" | "error"; person?: Person };
const ME = "#9e2a44";
const THEM = "#c07d1a";
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Profile → Stats → Compare (website CompareRings, owner only): pick a friend or anyone you've played with (or search
 * every player), then the stats; each stat shows my bar (maroon) and theirs (amber), numbers always written.
 * Claude's call: two bars per stat for now (the website draws rings); the screenshot pass can switch it.
 */
export function Compare({ mine, initial }: { mine: RoundStats; initial?: string | null }) {
  const [picked, setPicked] = useState<string[]>(COMPARE_DEFAULT);
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState<Loaded>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const started = useRef(false);

  useEffect(() => { apiJson<{ people?: Person[] }>("/api/profile/compare/people").then((r) => { if (r.ok) setPeople(r.body.people ?? []); }); }, []);
  const text = query.trim();
  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const r = await apiJson<{ accounts?: { username: string; name: string }[] }>(`/api/account/search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
      if (r.ok) setFound((r.body.accounts ?? []).map((a) => ({ username: a.username, name: a.name })));
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text]);

  async function compare(person: Person) {
    setQuery(""); setFound([]); setOpen(false); setLoaded({ status: "loading" });
    const r = await apiJson<{ result?: { status: string; person?: Person; stats?: RoundStats | null } }>(`/api/profile/compare?u=${encodeURIComponent(person.username)}`);
    const result = r.ok ? r.body.result : undefined;
    if (result?.status === "ok" && result.person) setLoaded({ status: "ok", person: result.person, stats: result.stats ?? null });
    else setLoaded({ status: result?.status === "private" ? "private" : result?.status === "not_found" ? "not_found" : "error", person: result?.person ?? person });
  }
  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    void compare({ username: initial, name: initial });
  }, [initial]);

  const them = loaded.status === "ok" ? loaded : null;
  const list = text.length >= 2 ? found : people;
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>COMPARE</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={styles.picker}>
        <SymbolView name="magnifyingglass" size={15} tintColor={colors.inkMuted} />
        {open ? <TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Search players" placeholderTextColor={colors.inkMuted} style={styles.input} autoCapitalize="none" />
          : <Text style={styles.pickerText}>{them ? `You vs ${firstName(them.person.name)}` : "Compare with a friend"}</Text>}
      </Pressable>
      {open && (
        <View style={styles.people}>
          {list.length === 0 ? <Text style={styles.note}>{text.length >= 2 ? `No players match “${text}”.` : "Type a name to search every player."}</Text>
            : list.slice(0, 8).map((p) => (
              <Pressable key={p.username} accessibilityRole="button" onPress={() => void compare(p)} style={styles.person}>
                <Text style={styles.personName}>{p.name}</Text><Text style={styles.note}>@{p.username}{p.friend ? " · Friend" : ""}</Text>
              </Pressable>
            ))}
        </View>
      )}
      <View style={styles.chips}>
        {COMPARE_METRICS.map((m) => (
          <Pressable key={m.key} accessibilityRole="button" accessibilityState={{ selected: picked.includes(m.key) }}
            onPress={() => setPicked((all) => all.includes(m.key) ? all.filter((k) => k !== m.key) : [...all, m.key])} style={[styles.chip, picked.includes(m.key) && styles.chipOn]}>
            <Text style={[styles.chipText, picked.includes(m.key) && styles.chipTextOn]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
      {loaded.status === "loading" && <ActivityIndicator color={colors.maroon700} />}
      {(loaded.status === "private" || loaded.status === "not_found" || loaded.status === "error") && (
        <Text style={styles.note}>{loaded.status === "private" ? `${loaded.person?.name ?? "Their"} profile is private.` : loaded.status === "not_found" ? "That player wasn't found." : "Couldn't load their stats. Try again."}</Text>
      )}
      {COMPARE_METRICS.filter((m) => picked.includes(m.key)).map((m) => {
        const a = m.value(mine), b = them?.stats ? m.value(them.stats) : null;
        return (
          <View key={m.key} style={styles.metric}>
            <Text style={styles.metricLabel}>{m.label}{m.lowerIsBetter ? " (lower is better)" : ""}</Text>
            <Bar color={ME} who="You" value={a} />
            {them && <Bar color={THEM} who={firstName(them.person.name)} value={b} />}
          </View>
        );
      })}
    </View>
  );
}

function Bar({ color, who, value }: { color: string; who: string; value: number | null }) {
  return (
    <View style={styles.barRow} accessibilityLabel={`${who}: ${value === null ? "no data" : `${value}%`}`}>
      <Text style={styles.barWho} numberOfLines={1}>{who}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, value ?? 0))}%`, backgroundColor: color }]} /></View>
      <Text style={styles.barValue}>{value === null ? "—" : `${value}%`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: "rgba(36,0,1,0.12)", backgroundColor: colors.white },
  heading: { fontFamily: fonts.capsSemibold, fontSize: 12, letterSpacing: 1.4, color: colors.maroon700 },
  picker: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream },
  pickerText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  input: { flex: 1, minHeight: 40, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  people: { gap: 2 },
  person: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  personName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.maroon700, borderColor: colors.maroon700 },
  chipText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  chipTextOn: { color: colors.cream },
  metric: { gap: 4 },
  metricLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barWho: { width: 56, fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: "rgba(36,0,1,0.08)" },
  fill: { height: "100%", borderRadius: 5 },
  barValue: { width: 44, textAlign: "right", fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
});
