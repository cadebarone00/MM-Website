import type { ReactNode } from "react";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

/** Settings building blocks (maroon page): a titled group, a tappable row, a password box and small notes. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <View style={styles.box}>{children}</View>
    </View>
  );
}

export function SettingsRow({ label, detail, onPress, danger, last }: { label: string; detail?: string; onPress?: () => void; danger?: boolean; last?: boolean }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : "text"} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && styles.pressed]}>
      <Text style={[styles.rowLabel, danger && styles.danger, !onPress && styles.off]}>{label}</Text>
      <View style={styles.rowEnd}>
        {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
        {onPress && <SymbolView name="chevron.right" size={13} tintColor={colors.wizardMuted} />}
      </View>
    </Pressable>
  );
}

export function PasswordBox({ label, value, onChange, disabled, newPassword, caps }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; newPassword?: boolean; caps?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} editable={!disabled} secureTextEntry={!caps} autoCapitalize={caps ? "characters" : "none"} autoCorrect={false}
        textContentType={caps ? "none" : newPassword ? "newPassword" : "password"} style={styles.input} placeholderTextColor={colors.wizardMuted} />
    </View>
  );
}

export const SettingsNote = ({ children }: { children: ReactNode }) => <Text style={styles.note}>{children}</Text>;
export const SettingsError = ({ children }: { children: ReactNode }) => <Text accessibilityRole="alert" style={styles.error}>{children}</Text>;
export const SettingsText = ({ children }: { children: ReactNode }) => <Text style={styles.text}>{children}</Text>;

const styles = StyleSheet.create({
  section: { gap: 8 },
  title: { fontFamily: fonts.capsSemibold, fontSize: 12, letterSpacing: 1.4, color: colors.gold },
  box: { gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.wizardFill },
  row: { minHeight: minTap, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.wizardLine },
  pressed: { opacity: 0.7 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  rowEnd: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  detail: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.wizardMuted },
  danger: { color: colors.errorOnMaroon },
  off: { color: colors.cream },
  field: { gap: 4 },
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.wizardMuted },
  input: { minHeight: 46, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine, backgroundColor: colors.inputOnMaroon, fontFamily: fonts.regular, fontSize: 16, color: colors.cream },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.wizardMuted },
  error: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19, color: colors.errorOnMaroon },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.cream },
});
