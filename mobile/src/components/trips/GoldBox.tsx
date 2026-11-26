import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius } from "~/lib/theme.ts";

/**
 * The trip page's gold-outlined box (TestFlight look: website TripBigBoard .board / TripMomentum .draftWidget): dark maroon
 * with soft gold light coming down from the top edge. Used by the Big Board and the draft cards.
 */
export function GoldBox({ style, children, accessibilityLabel }: { style?: StyleProp<ViewStyle>; children: React.ReactNode; accessibilityLabel?: string }) {
  return (
    <View style={[styles.box, style]} accessibilityLabel={accessibilityLabel}>
      <LinearGradient pointerEvents="none" colors={[colors.tripGlow, "transparent"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** A hairline that fades out at both ends (website .divider). */
export function FadeLine({ style }: { style?: StyleProp<ViewStyle> }) {
  return <LinearGradient pointerEvents="none" colors={["transparent", colors.tripLineFaint, "transparent"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[{ height: 1 }, style]} />;
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1, borderColor: colors.tripBorder, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.maroon900,
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 10 },
  },
});
