import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

/**
 * An on/off setting (website rule: every yes/no is a pill, gold when on, grey when off). Label (and an optional small
 * note under it) on the left. tone="dark" = the setup pages' boxed row on maroon (website .wizToggle).
 */
export function PillToggle({ label, note, value, onChange, disabled = false, tone = "light" }: {
  label: string; note?: string | null; value: boolean; onChange: (next: boolean) => void; disabled?: boolean; tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={note ? `${label}. ${note}` : label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(!value); }}
      style={[styles.row, dark && styles.darkRow]}
    >
      <View style={styles.text}>
        <Text style={[styles.label, dark && styles.darkLabel]}>{label}</Text>
        {note ? <Text style={[styles.note, dark && styles.darkNote]}>{note}</Text> : null}
      </View>
      <View style={[styles.track, value ? styles.on : dark ? styles.offDark : styles.off, disabled && styles.disabled]}>
        <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: minTap, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  darkRow: { minHeight: 52, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  text: { flex: 1 },
  label: { fontFamily: fonts.regular, fontSize: 17, color: colors.ink },
  darkLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  note: { marginTop: 2, fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  darkNote: { fontSize: 12, color: colors.wizardMuted },
  track: { width: 48, height: 28, borderRadius: radius.pill, padding: 3, justifyContent: "center" },
  on: { backgroundColor: colors.gold },
  off: { backgroundColor: colors.pillOff },
  offDark: { backgroundColor: "rgba(251,248,241,0.22)" },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.cream, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  knobOn: { alignSelf: "flex-end" },
  knobOff: { alignSelf: "flex-start" },
  disabled: { opacity: 0.45 },
});
