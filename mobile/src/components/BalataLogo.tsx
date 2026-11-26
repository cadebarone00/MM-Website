import { Image } from "expo-image";
import { StyleSheet, type StyleProp, type ImageStyle } from "react-native";

const logo = require("../../assets/brand/balata.png");

export function BalataLogo({ light = false, style }: { light?: boolean; style?: StyleProp<ImageStyle> }) {
  return <Image source={logo} contentFit="contain" accessibilityLabel="Balata" style={[styles.logo, light && styles.light, style]} />;
}

const styles = StyleSheet.create({
  logo: { width: 280, height: 94 },
  light: { tintColor: "#fbf8f1" },
});
