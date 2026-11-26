import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { BalataLogo } from "~/components/BalataLogo.tsx";

export function LoadingScreen() {
  return (
    <LinearGradient colors={["#771c2b", "#d7aeb2", "#faf2ed", "#faf2ed"]} locations={[0, 0.16, 0.4, 1]} style={styles.page}>
      <StatusBar style="light" />
      <BalataLogo />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, alignItems: "center", justifyContent: "center" } });
