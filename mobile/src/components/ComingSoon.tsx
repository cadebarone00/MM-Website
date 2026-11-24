import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** Placeholder for a tab that hasn't been rebuilt natively yet. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <View style={styles.page}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", padding: gutter, backgroundColor: colors.cream },
  title: { fontFamily: fonts.bold, fontSize: 28, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 17, color: colors.inkMuted, marginTop: 6 },
});
