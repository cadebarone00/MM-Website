import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Spectral_400Regular, Spectral_600SemiBold, Spectral_700Bold } from "@expo-google-fonts/spectral";
import { ActivityIndicator, View } from "react-native";
import { sheetOptions } from "~/components/SheetClose.tsx";
import { AuthProvider, useAuth } from "~/lib/auth.tsx";
import { TabBadgesProvider } from "~/lib/tabBadges.tsx";
import { colors } from "~/lib/theme.ts";

/** Signed in → the tabs. Signed out → Sign in. Expo Router switches automatically when that changes. */
function Screens() {
  const { loading, session } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.maroon900 }}>
        <ActivityIndicator color={colors.goldBright} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={session ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          {/* Dev only: the Building blocks gallery (Profile → Building blocks) and its sample slide-up. */}
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="dev/blocks" />
            <Stack.Screen name="dev/sheet" options={sheetOptions} />
          </Stack.Protected>
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Spectral_400Regular, Spectral_600SemiBold, Spectral_700Bold });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.maroon900 }} />;
  return (
    <AuthProvider>
      <TabBadgesProvider>
        <Screens />
      </TabBadgesProvider>
    </AuthProvider>
  );
}
