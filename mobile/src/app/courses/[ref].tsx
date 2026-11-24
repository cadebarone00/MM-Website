import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/Button.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { apiJson } from "~/lib/api.ts";
import { coursePlace } from "~/lib/courses.ts";
import { colors, fonts, gutter, radius } from "~/lib/theme.ts";

/** The parts of /api/courses/<ref> this screen shows (server type CoursePreview in lib/platform/golfGps/coursePreview). */
type Hole = { number: number; par: number; strokeIndex?: number; yards: Record<string, number> };
type CoursePreview = {
  name: string; city?: string; state?: string; holeCount?: number;
  teeSets: { name: string; totalYards?: number }[];
  scorecard?: Hole[];
  library: { gpsAvailable: boolean; mapAvailable: boolean; canPrepareGps: boolean };
  attribution: string;
};
type Load = { status: "loading" } | { status: "ready"; course: CoursePreview } | { status: "error"; message: string };

/**
 * On The Range → Courses → a course (website ExploreCourseProfile): name, place, par, holes, tees and what's available,
 * then View Course for the tee yardages and the scorecard. The GPS map needs a native map and comes to the app later.
 */
export default function CoursePreviewScreen() {
  const params = useLocalSearchParams<{ ref: string; name?: string; city?: string; state?: string; par?: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [view, setView] = useState<"preview" | "profile">("preview");

  useEffect(() => {
    const controller = new AbortController();
    apiJson<{ course?: CoursePreview }>(`/api/courses/${encodeURIComponent(params.ref)}`, { signal: controller.signal }).then((reply) => {
      if (!reply.ok && reply.code === "aborted") return;
      if (reply.ok && reply.body.course) setLoad({ status: "ready", course: reply.body.course });
      else setLoad({ status: "error", message: !reply.ok && reply.code === "busy" ? "Course data is busy right now. Try again in a few minutes." : !reply.ok && !reply.code ? "Couldn't reach course details. Check your connection." : "Course details aren't available right now." });
    });
    return () => controller.abort();
  }, [params.ref]);

  const info = load.status === "ready" ? load.course : null;
  const place = coursePlace(info ?? { city: params.city, state: params.state });
  const par = params.par ? Number(params.par) : null;
  const status: { icon: SymbolViewProps["name"]; text: string; good: boolean } | null = !info ? null
    : info.library.gpsAvailable ? { icon: "location.fill", text: "GPS available (opens in a later app update)", good: true }
    : info.library.mapAvailable ? { icon: "map", text: "Course map available", good: true }
    : { icon: "location.slash", text: "GPS isn't available for this course yet", good: false };

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}>
        <PageHeader title={view === "profile" ? "Course profile" : "Course"} back onBack={view === "profile" ? () => setView("preview") : undefined} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.name}>{info?.name ?? params.name ?? "Course"}</Text>
        {place ? <View style={styles.placeRow}><SymbolView name="mappin" size={13} tintColor={colors.inkMuted} /><Text style={styles.place}>{place}</Text></View> : null}
        <View style={styles.facts}>
          {par !== null && Number.isFinite(par) ? <Text style={styles.fact}>Par {par}</Text> : null}
          {info?.holeCount ? <Text style={styles.fact}>{info.holeCount} holes</Text> : null}
        </View>
        {load.status === "loading" && <View style={styles.row}><ActivityIndicator color={colors.maroon700} /><Text style={styles.hint}>Loading course details…</Text></View>}
        {load.status === "error" && <Text style={styles.error} accessibilityRole="alert">{load.message}</Text>}
        {status && (
          <View style={styles.row}>
            <SymbolView name={status.icon} size={15} tintColor={status.good ? colors.money.up : colors.inkMuted} />
            <Text style={[styles.hint, status.good && styles.good]}>{status.text}</Text>
          </View>
        )}
        {info && info.teeSets.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.caps}>TEES</Text>
            {view === "preview" ? <Text style={styles.body}>{info.teeSets.map((tee) => tee.name).join(" · ")}</Text>
              : info.teeSets.map((tee) => (
                <View key={tee.name} style={styles.teeRow}>
                  <Text style={styles.body}>{tee.name}</Text>
                  {tee.totalYards ? <Text style={styles.body}>{tee.totalYards.toLocaleString("en-US")} yds</Text> : null}
                </View>
              ))}
          </View>
        )}
        {view === "profile" && info?.scorecard && <Scorecard holes={info.scorecard} tees={info.teeSets.map((tee) => tee.name)} />}
        {view === "profile" && <Text style={styles.soon}>{info?.scorecard ? "Hole-by-hole maps and reviews are on the way." : "More of this course — scorecard, hole-by-hole maps and reviews — is on the way."}</Text>}
        {info && view === "preview" && <Button label="View Course" onPress={() => setView("profile")} style={styles.action} />}
        {info?.attribution ? <Text style={styles.credit}>{info.attribution}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The scorecard, nine holes per table like a paper card (website Scorecard): Hole, each tee's yards, Par, Hcp, totals. */
function Scorecard({ holes, tees }: { holes: Hole[]; tees: string[] }) {
  const shownTees = tees.filter((tee) => holes.some((hole) => hole.yards[tee]));
  const nines = Array.from({ length: Math.ceil(holes.length / 9) }, (_, i) => holes.slice(i * 9, i * 9 + 9));
  const sum = (list: Hole[], value: (hole: Hole) => number | undefined) => list.reduce((total, hole) => total + (value(hole) ?? 0), 0) || "";
  const label = (i: number) => nines.length === 2 ? (i === 0 ? "Out" : "In") : "Tot";
  const rows = (nine: Hole[], i: number) => [
    { head: "Hole", cells: nine.map((hole) => String(hole.number)), total: label(i), strong: true },
    ...shownTees.map((tee) => ({ head: tee, cells: nine.map((hole) => hole.yards[tee] ? String(hole.yards[tee]) : "–"), total: String(sum(nine, (hole) => hole.yards[tee])), strong: false })),
    { head: "Par", cells: nine.map((hole) => String(hole.par)), total: String(sum(nine, (hole) => hole.par)), strong: true },
    ...(nine.some((hole) => hole.strokeIndex) ? [{ head: "Hcp", cells: nine.map((hole) => hole.strokeIndex ? String(hole.strokeIndex) : "–"), total: "", strong: false }] : []),
  ];
  return (
    <View style={styles.block}>
      <Text style={styles.caps}>SCORECARD</Text>
      {nines.map((nine, i) => (
        <ScrollView key={i} horizontal showsHorizontalScrollIndicator={false} style={styles.card}>
          <View>
            {rows(nine, i).map((row) => (
              <View key={row.head} style={styles.cardRow}>
                <Text style={[styles.cardHead, row.strong && styles.cardStrong]} numberOfLines={1}>{row.head}</Text>
                {row.cells.map((cell, c) => <Text key={c} style={[styles.cell, row.strong && styles.cardStrong]}>{cell}</Text>)}
                <Text style={[styles.cell, styles.cellTotal, styles.cardStrong]}>{row.total}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  gutter: { paddingHorizontal: gutter },
  content: { paddingHorizontal: gutter, paddingBottom: 48, gap: 10 },
  name: { fontFamily: fonts.bold, fontSize: 28, color: colors.ink },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  place: { fontFamily: fonts.regular, fontSize: 15, color: colors.inkMuted },
  facts: { flexDirection: "row", gap: 14 },
  fact: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { fontFamily: fonts.regular, fontSize: 15, color: colors.inkMuted },
  good: { color: colors.money.up },
  error: { fontFamily: fonts.regular, fontSize: 15, color: colors.error },
  block: { gap: 6, marginTop: 6 },
  caps: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 1.4, color: colors.inkMuted },
  body: { fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  teeRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  card: { borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  cardRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cardHead: { width: 64, paddingVertical: 7, paddingHorizontal: 8, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  cardStrong: { fontFamily: fonts.semibold },
  cell: { width: 34, paddingVertical: 7, textAlign: "center", fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  cellTotal: { width: 46, backgroundColor: colors.cream },
  soon: { marginTop: 8, fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted },
  action: { marginTop: 12 },
  credit: { marginTop: 14, fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
});
