import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar } from "~/components/Avatar.tsx";
import { Button } from "~/components/Button.tsx";
import { apiGet } from "~/lib/api.ts";
import { supabase } from "~/lib/supabase.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

/** What /api/app/profile (view=profile) sends back — only the parts this screen uses. */
type ProfileReply = {
  page?: { status: "ok"; profile: { identity: { displayName: string; username: string; initials: string } } }
    | { status: "no-profile"; displayName: string } | { status: "signed-out" };
};

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; name: string; username: string | null; initials: string };

/** Step 1 proof: loads your real profile from the server with the app's own login. */
export default function Profile() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const reply = await apiGet<ProfileReply>("/api/app/profile");
    if (!reply.ok) return setState({ kind: "error", message: reply.error });
    const page = reply.data?.page;
    if (page?.status === "ok" && page.profile?.identity) {
      const { displayName, username, initials } = page.profile.identity;
      return setState({ kind: "ok", name: displayName, username, initials });
    }
    if (page?.status === "no-profile") {
      return setState({ kind: "ok", name: page.displayName || "Finish setting up your profile", username: null, initials: "?" });
    }
    setState({ kind: "error", message: "You're signed out. Sign in again." });
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <Text style={styles.heading}>Profile</Text>
      {/* Fixed height so the card doesn't jump between loading, error and loaded. */}
      <View style={styles.card}>
        {state.kind === "loading" && <ActivityIndicator color={colors.maroon700} />}
        {state.kind === "error" && (
          <>
            <Text style={styles.error}>{state.message}</Text>
            <Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
          </>
        )}
        {state.kind === "ok" && (
          <>
            <Avatar name={state.name} size={72} onLight />
            <Text style={styles.name}>{state.name}</Text>
            {state.username && <Text style={styles.username}>@{state.username}</Text>}
          </>
        )}
      </View>
      <View style={styles.actions}>
        <Button label="Sign out" variant="dark" onPress={() => { supabase.auth.signOut(); }} />
        {__DEV__ && <Button label="Building blocks (dev)" variant="secondary" onPress={() => router.push("/dev/blocks")} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: gutter },
  heading: { fontFamily: fonts.bold, fontSize: 30, color: colors.ink, marginTop: 12, marginBottom: 16 },
  card: { height: 200, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    alignItems: "center", justifyContent: "center", padding: gutter, gap: 6 },
  name: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginTop: 6 },
  username: { fontFamily: fonts.regular, fontSize: 16, color: colors.inkMuted },
  error: { fontFamily: fonts.regular, fontSize: 16, color: colors.error, textAlign: "center" },
  retry: { paddingVertical: 8, paddingHorizontal: 16 },
  retryText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon700 },
  actions: { marginTop: 24, gap: 10 },
});
