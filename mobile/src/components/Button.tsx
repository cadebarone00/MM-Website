import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

type Variant = "primary" | "secondary" | "secondaryOnDark" | "danger" | "dark";

/**
 * The one button. primary = gold, secondary = maroon outline, secondaryOnDark = gold outline (on maroon cards), danger = red, dark = maroon fill.
 * Always the same height (loading swaps the label for a spinner without changing size); a light tap on press.
 */
export function Button({ label, onPress, variant = "primary", disabled = false, loading = false, style }: {
  label: string; onPress: () => void; variant?: Variant; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const look = looks[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress(); }}
      style={({ pressed }) => [styles.base, look.box, pressed && styles.pressed, (disabled || loading) && styles.disabled, style]}
    >
      {loading ? <ActivityIndicator color={look.text.color} /> : <Text style={[styles.label, look.text]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 52, minHeight: minTap, borderRadius: radius.control, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 17 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});

const looks: Record<Variant, { box: ViewStyle; text: { color: string } }> = {
  primary: { box: { backgroundColor: colors.goldBright }, text: { color: colors.maroon900 } },
  secondary: { box: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.maroon700 }, text: { color: colors.maroon700 } },
  secondaryOnDark: { box: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.goldBright }, text: { color: colors.goldBright } },
  danger: { box: { backgroundColor: colors.error }, text: { color: colors.white } },
  dark: { box: { backgroundColor: colors.maroon900 }, text: { color: colors.onMaroon } },
};
