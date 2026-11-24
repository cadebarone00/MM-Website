import type { ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, radius } from "~/lib/theme.ts";

/**
 * The trip builder's look for step-by-step setup (website CreateTournament .wizard): maroon page, gold progress bar,
 * big title, the page's fields, and Back · Next at the bottom (Back a third, Next the rest).
 */
export function Wizard({ step, steps, title, children, backLabel = "Back", onBack, nextLabel, onNext, nextDisabled = false, busy = false }: {
  step: number; steps: number; title: string; children: ReactNode; backLabel?: string; onBack: () => void;
  nextLabel: string; onNext: () => void; nextDisabled?: boolean; busy?: boolean;
}) {
  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.head}>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps, now: step + 1 }}>
            <View style={[styles.fill, { width: `${((step + 1) / steps) * 100}%` }]} />
          </View>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {children}
        </ScrollView>
        <View style={styles.buttons}>
          <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: nextDisabled || busy, busy }} disabled={nextDisabled || busy}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onNext(); }}
            style={({ pressed }) => [styles.next, (nextDisabled || busy) && styles.nextOff, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color={colors.maroon900} /> : <Text style={[styles.nextText, nextDisabled && styles.nextTextOff]}>{nextLabel}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A section heading inside a page ("Side games"). */
export function WizardSection({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

/** A plain line of help text on a page. */
export function WizardNote({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "warn" | "error" }) {
  return <Text style={[styles.note, tone === "warn" && styles.warn, tone === "error" && styles.error]} accessibilityRole={tone === "plain" ? "text" : "alert"}>{children}</Text>;
}

/** A boxed text field with a small label (website .wizard .field). */
export function WizardField({ label, value, onChange, placeholder, keyboard = "default", maxLength, onSubmit }: {
  label: string; value: string; onChange: (text: string) => void; placeholder?: string; keyboard?: KeyboardTypeOptions; maxLength?: number; onSubmit?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.wizardDisabledInk} keyboardType={keyboard}
        maxLength={maxLength} onSubmitEditing={onSubmit} returnKeyType={onSubmit ? "done" : "default"} accessibilityLabel={label} style={styles.input} />
    </View>
  );
}

/** Pick one of a few (website .wizChoices): equal buttons in a row, gold when chosen. */
export function WizardChoices<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map(([option, text]) => (
          <Pressable key={String(option)} accessibilityRole="radio" accessibilityState={{ checked: value === option }}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(option); }}
            style={[styles.choice, value === option && styles.choiceOn]}>
            <Text style={[styles.choiceText, value === option && styles.choiceTextOn]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  flex: { flex: 1 },
  head: { paddingHorizontal: 20, paddingTop: 16 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.wizardTrack, marginBottom: 18, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: colors.gold },
  title: { marginBottom: 14, fontFamily: fonts.bold, fontSize: 30, lineHeight: 35, color: colors.cream },
  fields: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  buttons: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  back: { flexBasis: "32%", minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control },
  backText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.wizardMuted },
  next: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.control, backgroundColor: colors.gold },
  nextOff: { backgroundColor: colors.wizardDisabledFill },
  nextText: { fontFamily: fonts.semibold, fontSize: 18, color: colors.maroon900 },
  nextTextOff: { color: colors.wizardDisabledInk },
  pressed: { opacity: 0.85 },
  section: { marginTop: 10, fontFamily: fonts.semibold, fontSize: 20, color: colors.white },
  note: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.wizardMuted },
  warn: { color: colors.boardLink },
  error: { color: colors.errorOnMaroon },
  field: { gap: 2, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  fieldLabel: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.wizardMuted },
  input: { minHeight: 28, padding: 0, fontFamily: fonts.semibold, fontSize: 17, color: colors.cream },
  choices: { gap: 6 },
  choiceRow: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  choiceOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  choiceText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  choiceTextOn: { color: colors.maroon900 },
});

