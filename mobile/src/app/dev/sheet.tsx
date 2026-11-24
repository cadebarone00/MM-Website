import { StyleSheet, Text, View } from "react-native";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** Dev only: a sample of the standard 85% slide-up (the real iOS sheet) with the maroon X. */
export default function SampleSheet() {
  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Text style={styles.title}>Sample slide-up</Text>
        <SheetClose />
      </View>
      <Text style={styles.body}>Every 85% slide-up in the app looks like this. Swipe down or tap the X to close.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900, padding: gutter },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.onMaroon },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.searchMuted },
});
