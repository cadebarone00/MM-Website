import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { toggleHole } from "~/lib/setupHelpers.ts";
import { colors, fonts } from "~/lib/theme.ts";

/** Tap hole numbers to choose where a side game is played (website HolePicker): 6 per row, each with its par. */
export function HolePicker({ label, par, range, selected, onChange }: { label: string; par: number[]; range: [number, number]; selected: number[]; onChange: (holes: number[]) => void }) {
  const holes = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i + 1);
  return (
    <View style={styles.wrap} accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.grid}>
        {holes.map((n) => {
          const on = selected.includes(n);
          return (
            <Pressable key={n} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Hole ${n}, par ${par[n - 1]}`}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(toggleHole(selected, n)); }} style={[styles.hole, on && styles.holeOn]}>
              <Text style={[styles.number, on && styles.textOn]}>{n}</Text>
              <Text style={[styles.par, on && styles.textOn]}>Par {par[n - 1]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hole: { width: "15.2%", alignItems: "center", gap: 2, paddingVertical: 6, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: 10, backgroundColor: colors.wizardFill },
  holeOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  number: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  par: { fontFamily: fonts.regular, fontSize: 10, color: colors.cream, opacity: 0.8 },
  textOn: { color: colors.maroon900, opacity: 1 },
});
