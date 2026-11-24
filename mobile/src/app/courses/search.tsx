import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SearchBar, SearchNote, SearchProblem, SearchRow } from "~/components/Search.tsx";
import { apiJson } from "~/lib/api.ts";
import { COURSE_DEBOUNCE_MS, courseLine, coursePlace, courseSearchError, isRecentCourse, RECENT_COURSES_KEY, type CourseResult } from "~/lib/courses.ts";
import { useRecents } from "~/lib/useRecents.ts";
import { colors, fonts, gutter, minTap } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";

type Result = { status: "loading" } | { status: "done"; courses: CourseResult[]; attribution: string } | { status: "error"; message: string };

/**
 * Course search in the standard search look (website CourseSearchScreen): Recent courses before typing, results after
 * 2+ letters, a moment after typing stops; a newer search cancels the older one. `for=play` → picking starts a new
 * round with that course; `for=explore` (On The Range → Courses) → the course preview.
 */
export default function CourseSearch() {
  useLightStatusBar();
  const { for: purpose } = useLocalSearchParams<{ for?: string }>();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>({ status: "loading" });
  const { recents, remember, forget } = useRecents(RECENT_COURSES_KEY, isRecentCourse);
  const words = query.trim();
  const typing = words.length >= 2;

  useEffect(() => {
    if (!typing) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResult({ status: "loading" });
      const reply = await apiJson<{ courses?: CourseResult[]; attribution?: string }>(`/api/courses/search?q=${encodeURIComponent(words)}`, { signal: controller.signal });
      if (!reply.ok && reply.code === "aborted") return;
      if (!reply.ok) { setResult({ status: "error", message: reply.code ? courseSearchError(reply.code) : "Couldn't reach course search. Check your connection." }); return; }
      if (!Array.isArray(reply.body.courses)) { setResult({ status: "error", message: courseSearchError(null) }); return; }
      setResult({ status: "done", courses: reply.body.courses, attribution: reply.body.attribution ?? "" });
    }, COURSE_DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [words, typing]);

  function pick(course: CourseResult) {
    remember({ id: course.ref, ref: course.ref, name: course.name, city: course.city, state: course.state, par: course.par });
    if (purpose === "play") {
      router.replace({ pathname: "/rounds/new", params: { ref: course.ref, name: course.name, place: coursePlace(course) } });
    } else {
      router.push({ pathname: "/courses/[ref]", params: { ref: course.ref, name: course.name, city: course.city ?? "", state: course.state ?? "", par: course.par === null ? "" : String(course.par) } });
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.top}>
        <SearchBar value={query} onChange={setQuery} onBack={() => router.back()} placeholder="Course, club, or city" autoFocus maxLength={100} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {typing ? (
          result.status === "loading" ? <SearchNote>Searching…</SearchNote>
            : result.status === "error" ? <SearchProblem>{result.message}</SearchProblem>
            : !result.courses.length ? <SearchNote>{`No results for “${words}”. Try the club name or the city.`}</SearchNote>
            : (
              <>
                {result.courses.map((course) => <SearchRow key={course.ref} title={course.name} subtitle={courseLine(course)} icon="flag" onPress={() => pick(course)} />)}
                {result.attribution ? <Text style={styles.credit}>{result.attribution}</Text> : null}
              </>
            )
        ) : recents.length > 0 ? (
          <>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>Recent</Text>
              <Pressable accessibilityRole="button" onPress={() => forget(null)} style={styles.clear}><Text style={styles.clearText}>Clear all</Text></Pressable>
            </View>
            {recents.map((course) => (
              <SearchRow key={course.id} title={course.name} subtitle={courseLine(course)} icon="flag" onPress={() => pick(course)}
                end={(
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${course.name} from recent`} onPress={() => forget(course.id)} style={styles.remove}>
                    <SymbolView name="xmark" size={14} tintColor={colors.searchMuted} />
                  </Pressable>
                )} />
            ))}
          </>
        ) : <SearchNote>Search for a course by name, club or city.</SearchNote>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { paddingHorizontal: gutter },
  content: { paddingHorizontal: gutter, paddingBottom: 140 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 6 },
  heading: { fontFamily: fonts.bold, fontSize: 16, color: colors.searchInk },
  clear: { minHeight: minTap, justifyContent: "center" },
  clearText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.avatarGold },
  remove: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  credit: { marginTop: 14, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.searchFaint },
});
