import { useCallback, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FriendToggle } from "~/components/profile/FriendButtons.tsx";
import { ProfileHero, type ProfileTab } from "~/components/profile/ProfileHero.tsx";
import { OverviewTab, RoundsTab, StatsTab } from "~/components/profile/ProfileTabs.tsx";
import { StateSlot } from "~/components/StateSlot.tsx";
import { apiGet } from "~/lib/api.ts";
import type { Relation } from "~/lib/friends.ts";
import type { ProfileModel } from "~/lib/profileTypes.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Reply = { status: "not-found" } | { status: "self" } | { status: "ok"; profile: ProfileModel; friends: number | null; friendship?: { profileId: string; relation: Relation; tripMate: boolean } };
type Load = { status: "loading" } | { status: "error"; message: string } | Reply;

/**
 * Someone's profile (website /profile/<username>; project_specs.md "Expo app Step 3", part 3c): Back, @username, Rounds
 * · Friends · Handicap, name, bio, socials, Add friend + Compare; a Private profile shows its top only.
 */
export default function UserProfile() {
  useLightStatusBar();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [tab, setTab] = useState<ProfileTab>("overview");

  useFocusEffect(useCallback(() => {
    let live = true;
    apiGet<Reply>(`/api/app/profile?view=user&username=${encodeURIComponent(username)}`).then((r) => {
      if (!live) return;
      if (!r.ok) { setLoad({ status: "error", message: r.error }); return; }
      if (r.data.status === "self") { router.replace("/profile"); return; }
      setLoad(r.data);
    });
    return () => { live = false; };
  }, [username]));

  if (load.status !== "ok") {
    return (
      <SafeAreaView style={styles.plain} edges={["top"]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><SymbolView name="chevron.left" size={24} tintColor={colors.cream} /></Pressable>
        <StateSlot height={240} tone="dark" state={load.status === "loading" ? { kind: "loading" }
          : load.status === "not-found" ? { kind: "empty", message: "That profile wasn't found." }
          : { kind: "error", message: load.status === "error" ? load.message : "Couldn't load that profile." }} />
      </SafeAreaView>
    );
  }

  const { profile, friends, friendship } = load;
  const isPrivate = profile.access === "private";
  const actions = (friendship || !isPrivate) ? (
    <>
      {friendship && <FriendToggle profileId={friendship.profileId} initial={friendship.relation} tripMate={friendship.tripMate} />}
      {!isPrivate && (
        <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: "/profile", params: { compare: profile.identity.username } })} style={styles.compare}>
          <SymbolView name="chart.bar" size={15} tintColor={colors.cream} /><Text style={styles.compareText}>Compare</Text>
        </Pressable>
      )}
    </>
  ) : undefined;

  return (
    <View style={styles.page}>
      <SafeAreaView edges={["top"]} style={styles.top} />
      <ScrollView contentContainerStyle={styles.content}>
        <ProfileHero profile={profile} friends={friends} tab={tab} onTab={setTab} actions={actions}
          onFriends={isPrivate ? undefined : () => router.push({ pathname: "/profile/[username]/friends", params: { username: profile.identity.username } })} />
        <View style={styles.body}>
          {isPrivate ? (
            <View style={styles.private}><SymbolView name="lock.fill" size={26} tintColor={colors.maroon700} /><Text style={styles.privateText}>Private Profile</Text></View>
          ) : (
            <>
              {tab === "overview" && <OverviewTab profile={profile} />}
              {tab === "rounds" && <RoundsTab profile={profile} />}
              {tab === "stats" && <StatsTab profile={profile} />}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  top: { backgroundColor: colors.maroon900 },
  plain: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: gutter },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  content: { paddingBottom: 48 },
  body: { paddingHorizontal: gutter, paddingTop: 16 },
  compare: { flex: 1, minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, backgroundColor: "rgba(251,248,241,0.12)" },
  compareText: { fontFamily: fonts.bold, fontSize: 14, color: colors.cream },
  private: { alignItems: "center", gap: 8, paddingVertical: 40 },
  privateText: { fontFamily: fonts.bold, fontSize: 20, color: colors.maroon900 },
});
