import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

/** An on/off setting (website rule: every yes/no is a pill, gold when on, grey when off). Label on the left. */
export function PillToggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(!value); }}
      style={[styles.row, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.track, value ? styles.on : styles.off]}>
        <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: minTap, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { flex: 1, fontFamily: fonts.regular, fontSize: 17, color: colors.ink },
  track: { width: 52, height: 30, borderRadius: radius.pill, padding: 3, justifyContent: "center" },
  on: { backgroundColor: colors.goldBright },
  off: { backgroundColor: colors.pillOff },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white },
  knobOn: { alignSelf: "flex-end" },
  knobOff: { alignSelf: "flex-start" },
  disabled: { opacity: 0.5 },
});
