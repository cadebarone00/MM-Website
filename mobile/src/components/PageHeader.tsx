import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, minTap } from "~/lib/theme.ts";

/** A page's top row: optional back arrow, the title, optional gear on the right. Always the same height. */
export function PageHeader({ title, back = false, onBack, onSettings, tone = "light" }: {
  title: string; back?: boolean; onBack?: () => void; onSettings?: () => void; tone?: "light" | "dark";
}) {
  const ink = tone === "dark" ? colors.onMaroon : colors.ink;
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {back && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack ?? (() => router.back())} style={styles.icon}>
            <SymbolView name="chevron.left" size={20} tintColor={ink} weight="semibold" />
          </Pressable>
        )}
      </View>
      <Text style={[styles.title, { color: ink }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <View style={[styles.side, styles.right]}>
        {onSettings && (
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={styles.icon}>
            <SymbolView name="gearshape" size={20} tintColor={ink} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 52, flexDirection: "row", alignItems: "center" },
  side: { width: minTap, height: minTap, justifyContent: "center" },
  right: { alignItems: "flex-end" },
  icon: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 22 },
});
