import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileHero, type ProfileTab } from "~/components/profile/ProfileHero.tsx";
import { OverviewTab, RoundsTab, StatsTab } from "~/components/profile/ProfileTabs.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiGet, apiJson } from "~/lib/api.ts";
import type { MyProfileReply, ProfileModel } from "~/lib/profileTypes.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Load = { status: "loading" } | { status: "ok"; profile: ProfileModel; friends: number | null } | { status: "setup"; name: string } | { status: "error"; message: string };

/**
 * My profile (website ProfileView; project_specs.md "Expo app Step 3 — Profile", part 3a): the maroon top, then
 * Overview · Rounds · Stats. Loads again whenever the tab is shown; pull down to refresh.
 */
export default function Profile() {
  useLightStatusBar();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [requests, setRequests] = useState(0);
  // Someone's Compare button lands here with ?compare=<username>: open my Stats with them picked.
  const { compare } = useLocalSearchParams<{ compare?: string }>();
  const [tab, setTab] = useState<ProfileTab>(compare ? "stats" : "overview");
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    const [reply, friendReqs] = await Promise.all([apiGet<MyProfileReply>("/api/app/profile"), apiJson<{ count?: number }>("/api/profile/friends")]);
    if (friendReqs.ok) setRequests(Number(friendReqs.body.count) || 0);
    if (!reply.ok) { setLoad({ status: "error", message: reply.error }); return; }
    const page = reply.data?.page;
    if (page?.status === "ok") setLoad({ status: "ok", profile: page.profile, friends: reply.data.friends ?? null });
    else if (page?.status === "no-profile") setLoad({ status: "setup", name: page.displayName });
    else setLoad({ status: "error", message: "You're signed out. Sign in again." });
  }, []);
  useFocusEffect(useCallback(() => { void fetchProfile(); }, [fetchProfile]));
  const refresh = async () => { setRefreshing(true); await fetchProfile(); setRefreshing(false); };
  const back = <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>;

  if (load.status !== "ok") {
    return (
      <SafeAreaView style={styles.plain} edges={["top"]}>
        {back}
        <StateSlot height={240} tone="dark" state={load.status === "loading" ? { kind: "loading" }
          : load.status === "setup" ? { kind: "empty", message: "Finish setting up your profile on the website to see it here." }
          : { kind: "error", message: load.message, onRetry: () => { setLoad({ status: "loading" }); void fetchProfile(); } }} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.page}>
      <SafeAreaView edges={["top"]} style={styles.top} />
      <View style={styles.backBar}>{back}</View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.goldBright} />}>
        <ProfileHero profile={load.profile} friends={load.friends} requests={requests} tab={tab} onTab={setTab}
          onFriends={() => router.push({ pathname: "/profile/search", params: { tab: "friends" } })} />
        <View style={styles.body}>
          {tab === "overview" && <OverviewTab profile={load.profile} />}
          {tab === "rounds" && <RoundsTab profile={load.profile} />}
          {tab === "stats" && <StatsTab profile={load.profile} compareWith={compare ?? null} />}
        </View>
        {__DEV__ && <Text style={styles.dev} onPress={() => router.push("/dev/blocks")}>Building blocks (dev)</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  top: { backgroundColor: colors.maroon900 },
  backBar: { backgroundColor: colors.maroon900, paddingHorizontal: gutter },
  back: { width: 44, height: 44, justifyContent: "center" },
  backText: { color: colors.cream, fontSize: 36 },
  plain: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: gutter },
  content: { paddingBottom: 48 },
  body: { paddingHorizontal: gutter, paddingTop: 16 },
  dev: { marginTop: 24, textAlign: "center", fontFamily: fonts.semibold, fontSize: 14, color: colors.maroon700, textDecorationLine: "underline" },
});
