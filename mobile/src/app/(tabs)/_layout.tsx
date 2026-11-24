import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { colors, fonts } from "@/lib/theme.ts";

const icon = (name: SymbolViewProps["name"]) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={24} />;
  };

/** The same five tabs as the current app: Play · Golf Trips · Profile · Tourneys · Leagues. */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: colors.maroon900, borderTopColor: colors.maroon700 },
      tabBarActiveTintColor: colors.goldBright,
      tabBarInactiveTintColor: colors.tabInactive,
      tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
      sceneStyle: { backgroundColor: colors.cream },
    }}>
      <Tabs.Screen name="index" options={{ title: "Play", tabBarIcon: icon("flag.fill") }} />
      <Tabs.Screen name="golf-trips" options={{ title: "Golf Trips", tabBarIcon: icon("airplane") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person.fill") }} />
      <Tabs.Screen name="tourneys" options={{ title: "Tourneys", tabBarIcon: icon("trophy.fill") }} />
      <Tabs.Screen name="leagues" options={{ title: "Leagues", tabBarIcon: icon("person.3.fill") }} />
    </Tabs>
  );
}
