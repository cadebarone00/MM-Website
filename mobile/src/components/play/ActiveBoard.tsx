import { useCallback, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RoundInvites } from "./RoundInvites.tsx";
import { apiJson } from "~/lib/api.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Active = { id: string; name: string; place: string };
type Look = { status: "loading" } | { status: "active"; round: Active } | { status: "none" } | { status: "error" };

/**
 * Play home's "Your active board" (website PlayActiveBoard): a live round with friends → Round in progress (tap opens it);
 * none → "Ready for your next round?" + Search for a course; then Round invites and On The Range.
 * (A solo round kept only on this phone joins this board in Play part 2, when rounds can be started in the app.)
 */
export function ActiveBoard() {
  const [look, setLook] = useState<Look>({ status: "loading" });

  const load = useCallback(async (live: () => boolean) => {
    const mine = await apiJson<{ id?: string | null }>("/api/rounds/shared");
    if (!live()) return;
    if (!mine.ok) { setLook({ status: "error" }); return; }
    if (!mine.body.id) { setLook({ status: "none" }); return; }
    const id = mine.body.id;
    const detail = await apiJson<{ round?: { status: string; setup: { course: { name: string; place?: string } } } }>(`/api/rounds/shared/${encodeURIComponent(id)}`);
    if (!live()) return;
    if (!detail.ok || !detail.body.round) { setLook({ status: "error" }); return; }
    const round = detail.body.round;
    setLook(round.status === "live" ? { status: "active", round: { id, name: round.setup.course.name, place: round.setup.course.place ?? "" } } : { status: "none" });
  }, []);

  useFocusEffect(useCallback(() => {
    let live = true;
    void load(() => live);
    return () => { live = false; };
  }, [load]));

  return (
    <LinearGradient colors={[colors.boardTop, colors.boardBottom]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.board}>
      {/* Fixed-height top so the board doesn't change size between loading, a round and no round. */}
      <View style={styles.top}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.caps}>YOUR ACTIVE BOARD</Text>
            <Text style={styles.title}>Play</Text>
          </View>
          <View style={styles.mark}><Text style={styles.markText}>M</Text></View>
        </View>
        {look.status === "loading" && (
          <View style={styles.messageRow}><ActivityIndicator color={colors.boardGold} /><Text style={styles.message}>Looking for your round…</Text></View>
        )}
        {look.status === "active" && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Round in progress at ${look.round.name}. Open it`}
            onPress={() => router.push({ pathname: "/rounds/[id]", params: { id: look.round.id } })} style={({ pressed }) => [styles.paper, styles.activeRound, pressed && styles.pressed]}>
            <View style={styles.activeText}>
              <Text style={styles.paperCaps}>ROUND IN PROGRESS</Text>
              <Text style={styles.activeName} numberOfLines={1}>{look.round.name}</Text>
              <Text style={styles.activePlace} numberOfLines={1}>{look.round.place || "Continue your round"}</Text>
            </View>
            <SymbolView name="arrow.right" size={18} tintColor={colors.paperInk} />
          </Pressable>
        )}
        {look.status === "error" && (
          <Text style={styles.message}>
            Couldn&apos;t load your active round.{" "}
            <Text style={styles.link} accessibilityRole="button" onPress={() => { setLook({ status: "loading" }); void load(() => true); }}>Try again</Text>
          </Text>
        )}
        {look.status === "none" && (
          <>
            <Text style={styles.message}>Ready for your next round?</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Search for a course" onPress={() => router.push({ pathname: "/courses/search", params: { for: "play" } })}
              style={({ pressed }) => [styles.paper, styles.search, pressed && styles.pressed]}>
              <SymbolView name="magnifyingglass" size={17} tintColor={colors.paperInkSoft} />
              <Text style={styles.searchText}>Search for a course</Text>
              <SymbolView name="arrow.right" size={17} tintColor={colors.paperInkSoft} />
            </Pressable>
          </>
        )}
      </View>
      <View style={styles.lower}>
        <View style={styles.lowerHeading}>
          <Text style={styles.caps}>ROUND INVITES</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/range")} style={styles.rangeButton} hitSlop={8}>
            <Text style={styles.rangeText}>On The Range</Text>
            <SymbolView name="arrow.right" size={13} tintColor={colors.homeCream} />
          </Pressable>
        </View>
        <RoundInvites />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  board: { marginHorizontal: gutter, marginBottom: 8, borderWidth: 1, borderColor: colors.boardBorder, borderRadius: 20, overflow: "hidden" },
  top: { height: 195, padding: 20 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  caps: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 1.4, color: colors.boardGold },
  title: { marginTop: 5, fontFamily: fonts.semibold, fontSize: 28, color: colors.cream },
  mark: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.boardBorderSoft, alignItems: "center", justifyContent: "center" },
  markText: { fontFamily: fonts.semibold, fontSize: 18, color: colors.cream },
  messageRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 },
  message: { marginTop: 20, marginBottom: 12, fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk },
  link: { color: colors.boardLink, textDecorationLine: "underline" },
  paper: { borderWidth: 1, borderColor: colors.paperBorder, borderRadius: 10, backgroundColor: colors.paper },
  pressed: { opacity: 0.85 },
  activeRound: { marginTop: 17, minHeight: 80, paddingVertical: 14, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  activeText: { flex: 1, minWidth: 0, gap: 3 },
  paperCaps: { fontFamily: fonts.capsBold, fontSize: 10, letterSpacing: 1, color: colors.paperInkSoft },
  activeName: { fontFamily: fonts.bold, fontSize: 18, color: colors.paperInk },
  activePlace: { fontFamily: fonts.regular, fontSize: 14, color: colors.paperInkSoft },
  search: { minHeight: 50, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  searchText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.paperInkSoft },
  lower: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 12, borderTopWidth: 1, borderTopColor: colors.boardBorderSoft },
  lowerHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rangeButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  rangeText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.homeCream },
});
