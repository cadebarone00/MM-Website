import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, gutter, radius } from "~/lib/theme.ts";

/** A card. light = white on the cream page; dark = the maroon card (boards, scoring). Pass `height` to keep it one size. */
export function Card({ children, tone = "light", height, style }: { children: ReactNode; tone?: "light" | "dark"; height?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.base, tone === "dark" ? styles.dark : styles.light, height ? { height } : null, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.card, padding: gutter, overflow: "hidden" },
  light: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dark: { backgroundColor: colors.maroon900, borderWidth: 1, borderColor: colors.avatarRing },
});
