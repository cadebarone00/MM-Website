import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Spectral_400Regular, Spectral_600SemiBold, Spectral_700Bold } from "@expo-google-fonts/spectral";
import { Barlow_600SemiBold, Barlow_700Bold } from "@expo-google-fonts/barlow";
import { ActivityIndicator, View } from "react-native";
import { sheetOptions } from "~/components/SheetClose.tsx";
import { AuthProvider, useAuth } from "~/lib/auth.tsx";
import { PlayDataProvider } from "~/lib/playData.tsx";
import { TabBadgesProvider } from "~/lib/tabBadges.tsx";
import { colors } from "~/lib/theme.ts";

/**
 * Signed out → Welcome / Sign up / Log in (start/*). Signed in but not finished signing up (the server's onboarding step,
 * project_specs.md "Expo app Step 4") → onboarding/*. Finished → the tabs. Expo Router switches automatically.
 */
function Screens() {
  const { loading, session, step } = useAuth();
  const playing = !!session && step === "play";
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.maroon900 }}>
        <ActivityIndicator color={colors.goldBright} />
      </View>
    );
  }
  return (
    // Play content is loaded once per signed-in person (a new sign-in starts fresh).
    <PlayDataProvider key={`${session?.user.id ?? "signed-out"}:${playing}`}>
      <StatusBar style={playing ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
        <Stack.Protected guard={playing}>
          <Stack.Screen name="(tabs)" />
          {/* Play (project_specs.md "Expo app Step 0 + Step 1", part 1a). */}
          <Stack.Screen name="rounds/join" />
          <Stack.Screen name="rounds/[id]" />
          <Stack.Screen name="rounds/new" />
          <Stack.Screen name="courses/search" options={{ animation: "fade_from_bottom" }} />
          <Stack.Screen name="courses/[ref]" />
          <Stack.Screen name="range" />
          <Stack.Screen name="range/trip" options={sheetOptions} />
          <Stack.Screen name="range/post/[id]" />
          {/* Profile (project_specs.md "Expo app Step 3 — Profile"). */}
          <Stack.Screen name="profile/edit" />
          <Stack.Screen name="profile/search" />
          <Stack.Screen name="profile/[username]/index" />
          <Stack.Screen name="profile/[username]/friends" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="settings/delete-account" />
          {/* Golf Trips (project_specs.md "Expo app Step 2", part 2a). */}
          <Stack.Screen name="trips/join" />
          <Stack.Screen name="trips/invite" />
          <Stack.Screen name="trips/[id]" />
          <Stack.Screen name="trips/new" />
          <Stack.Screen name="trips/import" />
          {/* Dev only: the Building blocks gallery (Profile → Building blocks) and its sample slide-up. */}
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="dev/blocks" />
            <Stack.Screen name="dev/sheet" options={sheetOptions} />
          </Stack.Protected>
        </Stack.Protected>
        {/* Sign up + onboarding (project_specs.md "Expo app Step 4"). */}
        <Stack.Protected guard={!!session && !playing}>
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="onboarding/password" />
          <Stack.Screen name="onboarding/name" />
          <Stack.Screen name="onboarding/birthday" />
          <Stack.Screen name="onboarding/photo" />
          <Stack.Screen name="onboarding/settings" />
          <Stack.Screen name="onboarding/created" options={{ animation: "fade" }} />
          <Stack.Screen name="onboarding/status" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="start" />
          <Stack.Screen name="start/sign-up" />
          <Stack.Screen name="start/verify" />
          <Stack.Screen name="start/log-in" />
          <Stack.Screen name="start/forgot" />
          <Stack.Screen name="start/reset-password" />
        </Stack.Protected>
      </Stack>
    </PlayDataProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Spectral_400Regular, Spectral_600SemiBold, Spectral_700Bold, Barlow_600SemiBold, Barlow_700Bold });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.maroon900 }} />;
  return (
    <AuthProvider>
      <TabBadgesProvider>
        <Screens />
      </TabBadgesProvider>
    </AuthProvider>
  );
}
