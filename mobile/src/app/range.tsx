import { useState } from "react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RIBBON_TABS, type RibbonTab } from "@/lib/content/ribbon";
import { PostCard } from "~/components/range/PostCard.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { assetUrl } from "~/lib/api.ts";
import { usePlayData } from "~/lib/playData.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";

const ICONS: Record<RibbonTab, SymbolViewProps["name"]> = {
  Explore: "safari", Courses: "flag", Equipment: "bag", Teaching: "graduationcap", News: "newspaper",
};

/**
 * On The Range (website PlatformHome's Range view): Explore · Courses · Equipment · Teaching · News.
 * Explore = the featured trip + Explore posts; Courses = Find a course + Courses posts; the rest = their posts.
 */
export default function OnTheRange() {
  useLightStatusBar();
  const [tab, setTab] = useState<RibbonTab>("Explore");
  const { state, reload, posts, trip } = usePlayData();
  const list = posts(tab);

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Play" onPress={() => router.back()} style={styles.back}>
          <SymbolView name="arrow.left" size={20} tintColor={colors.cream} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">On The Range</Text>
      </View>
      <View style={styles.sheet}>
        <View style={styles.filters} accessibilityRole="tablist">
          {RIBBON_TABS.map((item) => (
            <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)}
              style={[styles.filter, tab === item && styles.filterOn]}>
              <SymbolView name={ICONS[item]} size={22} tintColor={colors.maroon950} />
              <Text style={styles.filterText}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === "Explore" && (
            <View style={styles.block}>
              <Text style={styles.heading}>Featured trip</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Featured trip: ${trip.city}. Open the itinerary`} onPress={() => router.push("/range/trip")}
                style={({ pressed }) => [styles.tripCard, pressed && styles.pressed]}>
                <Image source={{ uri: assetUrl(trip.image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                <Text style={styles.tripCity}>{trip.city}</Text>
                <View style={styles.tripOpen}><Text style={styles.tripOpenText}>View trip</Text><SymbolView name="arrow.right" size={12} tintColor={colors.maroon950} /></View>
              </Pressable>
            </View>
          )}
          {tab === "Courses" && (
            <View style={styles.coursePanel}>
              <Text style={styles.caps}>THE MAROON · COURSES</Text>
              <Text style={styles.courseTitle}>Find a course.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Search golf courses" onPress={() => router.push({ pathname: "/courses/search", params: { for: "explore" } })} style={styles.courseSearch}>
                <SymbolView name="magnifyingglass" size={17} tintColor={colors.inkMuted} />
                <Text style={styles.courseSearchText}>Course, club, or city</Text>
              </Pressable>
            </View>
          )}
          {state.status === "ready" ? (
            list.length ? list.map((post) => <PostCard key={post.id} post={post} onOpen={() => router.push({ pathname: "/range/post/[id]", params: { id: post.id } })} />)
              : tab !== "Explore" && tab !== "Courses" ? <Text style={styles.empty}>No posts yet.</Text> : null
          ) : (
            <StateSlot height={120} state={state.status === "loading" ? { kind: "loading" } : { kind: "error", message: state.message, onRetry: reload }} />
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon950 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: fonts.bold, fontSize: 26, color: colors.cream },
  sheet: { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden", backgroundColor: colors.rangePage },
  filters: { flexDirection: "row", justifyContent: "space-around", gap: 8, minHeight: 76, paddingVertical: 9, paddingHorizontal: 12 },
  filter: { flex: 1, minHeight: 60, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 16, paddingHorizontal: 4 },
  filterOn: { backgroundColor: colors.rangeFilterOn, shadowColor: colors.maroon950, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  filterText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.maroon950 },
  content: { paddingHorizontal: gutter, paddingBottom: 48, gap: 14 },
  block: { gap: 10 },
  heading: { fontFamily: fonts.bold, fontSize: 22, color: colors.maroon950 },
  tripCard: { height: 200, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.maroon900, justifyContent: "flex-end", padding: 16 },
  pressed: { opacity: 0.9 },
  tripCity: { fontFamily: fonts.bold, fontSize: 30, color: colors.white, textShadowColor: "rgba(0,0,0,0.45)", textShadowRadius: 8, marginBottom: 40 },
  tripOpen: { position: "absolute", left: 16, bottom: 14, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.homeCream },
  tripOpenText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.maroon950 },
  coursePanel: { gap: 8, padding: 18, borderRadius: radius.card, backgroundColor: colors.card },
  caps: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 1.4, color: colors.inkMuted },
  courseTitle: { fontFamily: fonts.bold, fontSize: 24, color: colors.maroon950 },
  courseSearch: { minHeight: minTap + 6, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream },
  courseSearchText: { fontFamily: fonts.regular, fontSize: 16, color: colors.inkMuted },
  empty: { paddingVertical: 24, textAlign: "center", fontFamily: fonts.regular, fontSize: 15, color: colors.inkMuted },
});
