import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiGet } from "@/lib/api.ts";
import { supabase } from "@/lib/supabase.ts";
import { colors, fonts, gutter } from "@/lib/theme.ts";

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
            <View style={styles.avatar}><Text style={styles.initials}>{state.initials}</Text></View>
            <Text style={styles.name}>{state.name}</Text>
            {state.username && <Text style={styles.username}>@{state.username}</Text>}
          </>
        )}
      </View>
      <Pressable onPress={() => supabase.auth.signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: gutter },
  heading: { fontFamily: fonts.bold, fontSize: 30, color: colors.ink, marginTop: 12, marginBottom: 16 },
  card: { height: 200, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    alignItems: "center", justifyContent: "center", padding: gutter, gap: 6 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.gold, alignItems: "center",
    justifyContent: "center", backgroundColor: colors.maroon900 },
  initials: { fontFamily: fonts.semibold, fontSize: 24, color: colors.onMaroon },
  name: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginTop: 6 },
  username: { fontFamily: fonts.regular, fontSize: 16, color: colors.inkMuted },
  error: { fontFamily: fonts.regular, fontSize: 16, color: colors.error, textAlign: "center" },
  retry: { paddingVertical: 8, paddingHorizontal: 16 },
  retryText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.maroon700 },
  signOut: { marginTop: 24, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center", backgroundColor: colors.maroon900 },
  pressed: { opacity: 0.85 },
  signOutText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.onMaroon },
});
