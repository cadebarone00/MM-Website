import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RowFriendButton } from "~/components/profile/FriendButtons.tsx";
import { PageHeader } from "~/components/PageHeader.tsx";
import { SearchBar, SearchNote, SearchProblem, SearchRow } from "~/components/Search.tsx";
import { apiGet } from "~/lib/api.ts";
import { befriend, friendsCountLabel, matchesFriend, type FriendOfItem } from "~/lib/friends.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { colors, fonts, gutter } from "~/lib/theme.ts";

type Reply = { status: "not-found" } | { status: "self" } | { status: "private"; username: string } | { status: "ok"; username: string; signedIn: boolean; friends: FriendOfItem[] };

/** Someone's Friends list (website UserFriendsList; opened from the Friends count on their Public profile). */
export default function UserFriends() {
  useLightStatusBar();
  const { username } = useLocalSearchParams<{ username: string }>();
  const [reply, setReply] = useState<Reply | null>(null);
  const [friends, setFriends] = useState<FriendOfItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Reply>(`/api/app/profile?view=user-friends&username=${encodeURIComponent(username)}`).then((r) => {
      if (!r.ok) { setError(r.error); return; }
      if (r.data.status === "self") { router.replace({ pathname: "/profile/search", params: { tab: "friends" } }); return; }
      setReply(r.data);
      if (r.data.status === "ok") setFriends(r.data.friends);
    });
  }, [username]);

  async function add(f: FriendOfItem) {
    setBusy(f.id); setError(null);
    const r = await befriend(f.id);
    setBusy(null);
    if (r.ok) setFriends((list) => list && list.map((x) => x.id === f.id ? { ...x, relation: r.relation } : x)); else setError(r.error);
  }
  const shown = friends?.filter((f) => matchesFriend(f, query)) ?? null;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.gutter}>
        <PageHeader title={username} back tone="dark" />
        {friends && <SearchBar value={query} onChange={setQuery} placeholder="Search" onCancel={query ? () => setQuery("") : undefined} />}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {error && <SearchProblem>{error}</SearchProblem>}
        {!reply && !error ? <SearchNote>Loading…</SearchNote>
          : reply?.status === "private" ? <View style={styles.private}><SymbolView name="lock.fill" size={26} tintColor={colors.avatarGold} /><Text style={styles.privateTitle}>Private Profile</Text><Text style={styles.note}>Their friends list is hidden.</Text></View>
          : reply?.status === "not-found" ? <SearchNote>That profile wasn&apos;t found.</SearchNote>
          : friends && !friends.length ? <SearchNote>No friends yet.</SearchNote>
          : shown && !shown.length ? <SearchNote>{`No friends match “${query.trim()}”.`}</SearchNote>
          : shown && (
            <>
              <Text style={styles.heading}>{query.trim() ? "Friends" : friendsCountLabel(friends!.length)}</Text>
              {shown.map((f) => (
                <SearchRow key={f.id} title={f.username ?? f.name} subtitle={f.name} person={{ name: f.name, photoUrl: f.photoUrl }}
                  onPress={f.username && !f.you ? () => router.push({ pathname: "/profile/[username]", params: { username: f.username! } }) : undefined}
                  end={f.you ? <Text style={styles.you}>You</Text> : <RowFriendButton relation={f.relation} busy={busy === f.id} onAdd={() => void add(f)} />} />
              ))}
            </>
          )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  gutter: { paddingHorizontal: gutter },
  content: { paddingHorizontal: gutter, paddingBottom: 120 },
  heading: { marginTop: 18, marginBottom: 6, fontFamily: fonts.bold, fontSize: 16, color: colors.searchInk },
  private: { alignItems: "center", gap: 6, paddingVertical: 40 },
  privateTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  note: { fontFamily: fonts.regular, fontSize: 14, color: colors.searchMuted },
  you: { fontFamily: fonts.semibold, fontSize: 13, color: colors.searchMuted },
});
