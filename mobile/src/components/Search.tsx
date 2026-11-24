import type { ReactNode } from "react";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Avatar } from "./Avatar.tsx";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

/**
 * The standard search look (website rule 2026-11-22: every search looks like Friends search). Solid maroon page, a bar
 * with Back · search box · Cancel, then plain 64px rows. Use SearchBar + SearchRow + SearchNote / SearchProblem.
 */
export function SearchBar({ value, onChange, onBack, onCancel, placeholder = "Search", autoFocus = false, maxLength = 60 }: {
  value: string; onChange: (text: string) => void; onBack?: () => void; onCancel?: () => void; placeholder?: string; autoFocus?: boolean; maxLength?: number;
}) {
  return (
    <View style={styles.bar}>
      {onBack && (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
          <SymbolView name="chevron.left" size={20} tintColor={colors.searchInk} weight="semibold" />
        </Pressable>
      )}
      <View style={styles.field}>
        <SymbolView name="magnifyingglass" size={16} tintColor={colors.searchMuted} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.searchFaint}
          autoFocus={autoFocus}
          maxLength={maxLength}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.input}
          accessibilityLabel={placeholder}
        />
      </View>
      {onCancel && (
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

/** One result row: avatar (a person) or a round icon (a course, a place), two lines, and a chevron or a custom end. */
export function SearchRow({ title, subtitle, person, icon, onPress, end }: {
  title: string; subtitle?: string; person?: { name: string; photoUrl?: string | null }; icon?: SymbolViewProps["name"]; onPress?: () => void; end?: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {person ? <Avatar name={person.name} photoUrl={person.photoUrl} size={48} />
        : <View style={styles.icon}><SymbolView name={icon ?? "flag"} size={20} tintColor={colors.avatarGold} /></View>}
      <View style={styles.names}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {end ?? (onPress ? <SymbolView name="chevron.right" size={14} tintColor={colors.searchFaint} /> : null)}
    </Pressable>
  );
}

/** A quiet line under the results ("No golfers match", "Type at least 2 letters"). */
export function SearchNote({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

/** A red box when the search itself failed. */
export function SearchProblem({ children }: { children: string }) {
  return <Text style={styles.problem} accessibilityRole="alert">{children}</Text>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 10 },
  back: { width: 40, height: minTap, marginLeft: -8, alignItems: "center", justifyContent: "center" },
  field: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: radius.control, backgroundColor: colors.searchField },
  input: { flex: 1, minHeight: 40, fontFamily: fonts.regular, fontSize: 16, color: colors.searchInk },
  cancel: { minHeight: minTap, justifyContent: "center", paddingHorizontal: 2 },
  cancelText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.searchInk },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 },
  pressed: { opacity: 0.7 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.searchField, alignItems: "center", justifyContent: "center" },
  names: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.searchInk },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, color: colors.searchMuted },
  note: { marginTop: 18, textAlign: "center", fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.searchMuted },
  problem: { marginVertical: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, overflow: "hidden", backgroundColor: colors.problem, color: colors.white, fontFamily: fonts.semibold, fontSize: 14 },
});
