import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "~/lib/theme.ts";

/** How tall the tucked sheet's handle is (grabber + SCORING pill), above the home bar. */
export const TUCKED_HEIGHT = 64;

/**
 * A sheet that lives tucked into the bottom of the page and slides up over it (owner 2026-11-24: "like Kalshi's swipe
 * up"). Drag the handle up to open, down (or flick) to tuck it away; tap the handle to toggle. Tucked, it's 94% wide and
 * shows `tuckedMeta` (e.g. "+2 • Thru 7"); open, it grows to full width and dims the page behind (website GolfTripScoring).
 */
export function TuckSheet({ open, onOpenChange, label, tuckedMeta, topRight, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; label: string; tuckedMeta?: string | null; topRight?: ReactNode; children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const openTop = insets.top + 8;
  const closedTop = height - TUCKED_HEIGHT - insets.bottom;
  const travel = Math.max(1, closedTop - openTop);
  const y = useRef(new Animated.Value(open ? 0 : travel)).current;
  const at = useRef(open ? 0 : travel);
  const openRef = useRef(open);
  openRef.current = open;

  const snap = (toOpen: boolean, velocity = 0) => {
    const to = toOpen ? 0 : travel;
    at.current = to;
    Animated.spring(y, { toValue: to, velocity, useNativeDriver: false, damping: 22, stiffness: 220, mass: 0.9 }).start();
    if (toOpen !== openRef.current) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onOpenChange(toOpen); }
  };
  // The parent can open / tuck it too (e.g. Scorecard on the last hole keeps it open; after saving it tucks away).
  useEffect(() => {
    const to = open ? 0 : travel;
    if (at.current !== to) { at.current = to; Animated.spring(y, { toValue: to, useNativeDriver: false, damping: 22, stiffness: 220 }).start(); }
  }, [open, travel, y]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderGrant: () => { y.stopAnimation((value) => { at.current = value; }); },
    onPanResponderMove: (_, g) => { y.setValue(Math.min(travel, Math.max(0, at.current + g.dy))); },
    onPanResponderRelease: (_, g) => {
      // A tap toggles; a flick goes the way it was flicked; otherwise it settles on the nearer end.
      if (Math.abs(g.dy) < 6 && Math.abs(g.dx) < 6) { snap(!openRef.current); return; }
      const now = Math.min(travel, Math.max(0, at.current + g.dy));
      at.current = now;
      if (g.vy < -0.5) snap(true, g.vy);
      else if (g.vy > 0.5) snap(false, g.vy);
      else snap(now < travel / 2, g.vy);
    },
    onPanResponderTerminate: () => snap(openRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [travel]);

  const progress = y.interpolate({ inputRange: [0, travel], outputRange: [1, 0], extrapolate: "clamp" });
  const sideInset = progress.interpolate({ inputRange: [0, 1], outputRange: ["3%", "0%"] });
  return (
    <>
      <Animated.View pointerEvents={open ? "auto" : "none"} style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable accessibilityLabel={`Tuck ${label} away`} style={StyleSheet.absoluteFill} onPress={() => snap(false)} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { top: openTop, height: height - openTop, left: sideInset, right: sideInset, transform: [{ translateY: y }] }]}>
        <LinearGradient colors={[colors.sheetTop, colors.sheetBottom]} style={StyleSheet.absoluteFill} />
        <View {...pan.panHandlers} style={styles.handle} accessibilityRole="button" accessibilityLabel={open ? `Tuck ${label} away` : `Open ${label}`} accessibilityState={{ expanded: open }}>
          <View style={styles.grabber} />
          <View style={styles.handleRow}>
            <Text style={styles.meta} numberOfLines={1}>{!open && tuckedMeta ? tuckedMeta : ""}</Text>
            <View style={styles.pill}><Text style={styles.pillText}>{label.toUpperCase()}</Text></View>
            <View style={styles.right}>{open ? topRight : null}</View>
          </View>
        </View>
        <View style={[styles.body, { paddingBottom: insets.bottom }]} pointerEvents={open ? "auto" : "none"}>{children}</View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.sheetBackdrop },
  sheet: { position: "absolute", borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  handle: { height: TUCKED_HEIGHT, paddingTop: 14, paddingHorizontal: 16 },
  grabber: { position: "absolute", top: 7, alignSelf: "center", width: 40, height: 4, borderRadius: 4, backgroundColor: colors.sheetGrabber },
  handleRow: { flexDirection: "row", alignItems: "center" },
  meta: { flex: 1, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.4, color: colors.sheetMuted },
  pill: { width: 119, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.sheetLineSoft, backgroundColor: colors.sheetGlass },
  pillText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.7, color: colors.sheetInk },
  right: { flex: 1, alignItems: "flex-end" },
  body: { flex: 1 },
});
