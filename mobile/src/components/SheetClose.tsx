import type { ComponentProps } from "react";
import { router, type Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet } from "react-native";
import { colors, minTap, radius } from "~/lib/theme.ts";

/**
 * The slide-up sheets' close button (website standard 2026-11-23): see-through maroon rounded square around an X.
 * 36px square, with a 44pt tap area. Closes the sheet by going back unless `onPress` is given.
 */
export function SheetClose({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={(minTap - 36) / 2}
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [styles.box, pressed && styles.pressed]}
    >
      <SymbolView name="xmark" size={16} tintColor={colors.cream} weight="semibold" />
    </Pressable>
  );
}

/**
 * Screen options for every 85% slide-up (Expo Router `formSheet`, the real iOS sheet). Use on a Stack.Screen:
 * `<Stack.Screen name="…" options={sheetOptions} />`.
 */
type ScreenOptions = Extract<NonNullable<ComponentProps<typeof Stack.Screen>["options"]>, object>;
export const sheetOptions: ScreenOptions = {
  presentation: "formSheet",
  sheetAllowedDetents: [0.85],
  sheetGrabberVisible: false,
  sheetCornerRadius: 24,
  headerShown: false,
  contentStyle: { backgroundColor: colors.maroon900 },
};

const styles = StyleSheet.create({
  box: { width: 36, height: 36, borderRadius: radius.close, borderWidth: 1, borderColor: colors.closeRing, backgroundColor: colors.closeFill, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
});
