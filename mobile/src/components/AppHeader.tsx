import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BalataLogo } from "~/components/BalataLogo.tsx";
import { PlayMenu } from "~/components/play/PlayMenu.tsx";
import { colors, gutter } from "~/lib/theme.ts";

export function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <View style={styles.brand}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open Menu" accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(true)} style={styles.menuButton}>
        <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLine} />
      </Pressable>
      <BalataLogo light style={styles.logo} />
    </View>
    <PlayMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
  </>;
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", backgroundColor: colors.darkBackground, paddingHorizontal: gutter, minHeight: 64 },
  menuButton: { width: 44, height: 44, justifyContent: "center", gap: 4 },
  menuLine: { width: 22, height: 2, backgroundColor: colors.cream, borderRadius: 1 },
  logo: { width: 135, height: 45, marginLeft: -16, transform: [{ translateY: -1.5 }] },
});
