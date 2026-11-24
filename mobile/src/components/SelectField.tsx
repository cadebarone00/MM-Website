import { useState } from "react";
import { SymbolView } from "expo-symbols";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetClose } from "./SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

export type SelectOption<T extends string> = { value: T; label: string; detail?: string };

/**
 * A pick-one field: shows the chosen option, tapping opens the native iOS page sheet with the list (check on the pick).
 * tone="dark" = the setup pages' boxed field on maroon.
 */
export function SelectField<T extends string>({ label, value, options, onChange, placeholder = "Choose", tone = "light" }: {
  label: string; value: T | null; options: SelectOption<T>[]; onChange: (value: T) => void; placeholder?: string; tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`} onPress={() => setOpen(true)} style={[styles.field, dark && styles.darkField]}>
        <Text style={[styles.label, dark && styles.darkLabel]}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, dark && styles.darkValue, !chosen && styles.placeholder]} numberOfLines={1}>{chosen?.label ?? placeholder}</Text>
          <SymbolView name="chevron.up.chevron.down" size={13} tintColor={dark ? colors.wizardMuted : colors.inkMuted} />
        </View>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.sheetTop}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <SheetClose onPress={() => setOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {options.map((option) => (
              <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: option.value === value }}
                onPress={() => { onChange(option.value); setOpen(false); }} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  {option.detail ? <Text style={styles.optionDetail}>{option.detail}</Text> : null}
                </View>
                {option.value === value && <SymbolView name="checkmark" size={16} tintColor={colors.goldBright} weight="semibold" />}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 56, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center" },
  darkField: { borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  label: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  darkLabel: { fontSize: 12, color: colors.wizardMuted },
  darkValue: { color: colors.cream },
  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  value: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
  placeholder: { color: colors.tabInactive, fontFamily: fonts.regular },
  sheet: { flex: 1, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: 8 },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.onMaroon },
  list: { paddingHorizontal: gutter, paddingBottom: gutter },
  option: { minHeight: minTap + 8, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.searchLine },
  pressed: { opacity: 0.7 },
  optionText: { flex: 1 },
  optionLabel: { fontFamily: fonts.semibold, fontSize: 17, color: colors.onMaroon },
  optionDetail: { fontFamily: fonts.regular, fontSize: 14, color: colors.searchMuted },
});
