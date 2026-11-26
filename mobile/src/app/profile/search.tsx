import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RowFriendButton } from "~/components/profile/FriendButtons.tsx";
import { SearchBar, SearchNote, SearchProblem, SearchRow } from "~/components/Search.tsx";
import { apiGet, apiJson } from "~/lib/api.ts";
import { answerRequest, befriend, friendsCountLabel, matchesFriend, type FriendListItem, type FriendRequest, type GolferResult, type Relation } from "~/lib/friends.ts";
import { useLightStatusBar } from "~/lib/statusBar.ts";
import { useRecents } from "~/lib/useRecents.ts";
import { colors, fonts, gutter, minTap } from "~/lib/theme.ts";

type Tab = "search" | "friends" | "suggested";
const TABS: { id: Tab; label: string }[] = [{ id: "search", label: "Search" }, { id: "friends", label: "Friends" }, { id: "suggested", label: "Suggested" }];
type Recent = { id: string; name: string; username: string | null; photoUrl: string | null; isPrivate: boolean };
const isRecent = (v: unknown): v is Recent => typeof (v as Recent | null)?.id === "string" && typeof (v as Recent | null)?.name === "string";

/**
 * Search golfers (website ProfileSearch, Instagram-style; project_specs.md "Expo app Step 3", part 3c): Search ·
 * Friends · Suggested. Search shows friend requests and Recent, then results after 2+ letters. Friends lists mine
 * (typing narrows them). Suggested shows "Suggested for you"; typing there goes to Search. Tap a golfer → their profile.
 */
export default function ProfileSearch() {
  useLightStatusBar();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "friends" || params.tab === "suggested" ? params.tab : "search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GolferResult[] | null>(null);
  const [suggested, setSuggested] = useState<GolferResult[] | null>(null);
  const [friends, setFriends] = useState<FriendListItem[] | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { recents, remember, forget } = useRecents("maroon-search-recent-v1", isRecent);
  const words = query.trim();
  const typing = tab === "search" && words.length >= 2;

  useEffect(() => {
    apiJson<{ incoming?: FriendRequest[] }>("/api/profile/friends?requests=1").then((r) => { if (r.ok) setIncoming(r.body.incoming ?? []); });
    apiJson<{ golfers?: GolferResult[] }>("/api/profile/search?suggest=1").then((r) => setSuggested(r.ok ? r.body.golfers ?? [] : []));
    apiGet<{ status: string; friends?: FriendListItem[] }>("/api/app/profile?view=friends").then((r) => setFriends(r.ok && r.data.status === "ok" ? r.data.friends ?? [] : []));
  }, []);

  useEffect(() => {
    if (!typing) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const reply = await apiJson<{ golfers?: GolferResult[] }>(`/api/profile/search?q=${encodeURIComponent(words)}`, { signal: controller.signal });
      if (!reply.ok && reply.code === "aborted") return;
      if (reply.ok) { setResults(reply.body.golfers ?? []); setProblem(null); } else setProblem(reply.error);
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [words, typing]);

  const type = (value: string) => { setQuery(value); if (tab === "suggested" && value.trim()) setTab("search"); };
  const setRelation = useCallback((id: string, relation: Relation) => {
    setResults((list) => list && list.map((g) => g.id === id ? { ...g, relation } : g));
    setSuggested((list) => list && list.map((g) => g.id === id ? { ...g, relation } : g));
  }, []);
  const addFriend = (f: Pick<FriendListItem, "id" | "name" | "username" | "photoUrl">) =>
    setFriends((list) => list && !list.some((x) => x.id === f.id) ? [...list, { ...f, tripMate: false }].sort((a, b) => a.name.localeCompare(b.name)) : list);

  async function add(golfer: GolferResult) {
    setBusy(golfer.id); setProblem(null);
    const reply = await befriend(golfer.id);
    setBusy(null);
    if (!reply.ok) { setProblem(reply.error); return; }
    setRelation(golfer.id, reply.relation);
    if (reply.relation === "friends") { setIncoming((list) => list.filter((r) => r.profileId !== golfer.id)); addFriend(golfer); }
  }
  async function answer(request: FriendRequest, accept: boolean) {
    setBusy(request.id); setProblem(null);
    const reply = await answerRequest(request.id, accept);
    setBusy(null);
    if (!reply.ok) { setProblem(reply.error ?? null); return; }
    setIncoming((list) => list.filter((r) => r.id !== request.id));
    setRelation(request.profileId, accept ? "friends" : "none");
    if (accept) addFriend({ id: request.profileId, name: request.name, username: request.username, photoUrl: request.photoUrl });
  }
  const open = (g: Recent) => {
    remember({ id: g.id, name: g.name, username: g.username, photoUrl: g.photoUrl, isPrivate: g.isPrivate });
    if (g.username) router.push({ pathname: "/profile/[username]", params: { username: g.username } });
  };
  const row = (g: Recent, note?: string, end?: React.ReactNode) => (
    <SearchRow key={g.id} title={`${g.username ?? g.name}${g.isPrivate ? " 🔒" : ""}`} subtitle={note ? `${g.name} · ${note}` : g.name}
      person={{ name: g.name, photoUrl: g.photoUrl }} onPress={() => open(g)} end={end} />
  );
  const shownFriends = friends?.filter((f) => matchesFriend(f, words)) ?? null;

  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.top}>
        <SearchBar value={query} onChange={type} onBack={() => router.back()} onCancel={query ? () => setQuery("") : undefined}
          placeholder={tab === "friends" ? "Search friends" : "Search"} />
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
              <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {problem && <SearchProblem>{problem}</SearchProblem>}
        {tab === "friends" ? (
          friends === null ? <SearchNote>Loading your friends…</SearchNote>
            : !friends.length ? <SearchNote>No friends yet. Golf on a trip together, or add golfers from Suggested.</SearchNote>
            : !shownFriends?.length ? <SearchNote>{`No friends match “${words}”.`}</SearchNote>
            : (
              <>
                <Text style={styles.heading}>{words ? "Friends" : friendsCountLabel(friends.length)}</Text>
                {shownFriends.map((f) => row({ ...f, isPrivate: false }, f.tripMate ? "Golf trip" : undefined))}
              </>
            )
        ) : tab === "suggested" ? (
          <>
            <Text style={styles.heading}>Suggested for you</Text>
            {suggested === null ? <SearchNote>Finding golfers…</SearchNote>
              : !suggested.length ? <SearchNote>No suggestions yet. Search for a golfer by name or @username.</SearchNote>
              : suggested.map((g) => row(g, g.mutuals ? `${g.mutuals} mutual friend${g.mutuals === 1 ? "" : "s"}` : "Suggested for you",
                <RowFriendButton relation={g.relation} busy={busy === g.id} onAdd={() => void add(g)} />))}
          </>
        ) : typing ? (
          results === null ? <SearchNote>Searching…</SearchNote>
            : !results.length ? <SearchNote>{`No golfers match “${words}”.`}</SearchNote>
            : results.map((g) => row(g, g.tripMate ? "Golf trip" : undefined, <RowFriendButton relation={g.relation} busy={busy === g.id} onAdd={() => void add(g)} />))
        ) : (
          <>
            {incoming.length > 0 && (
              <>
                <Text style={styles.heading}>Friend requests</Text>
                {incoming.map((r) => row({ id: r.profileId, name: r.name, username: r.username, photoUrl: r.photoUrl, isPrivate: false }, undefined, (
                  <View style={styles.answers}>
                    <Pressable accessibilityRole="button" disabled={busy === r.id} onPress={() => void answer(r, true)} style={styles.accept}><Text style={styles.acceptText}>Accept</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${r.name}`} disabled={busy === r.id} onPress={() => void answer(r, false)} style={styles.decline}>
                      <SymbolView name="xmark" size={13} tintColor={colors.searchMuted} />
                    </Pressable>
                  </View>
                )))}
              </>
            )}
            {recents.length > 0 ? (
              <>
                <View style={styles.headingRow}>
                  <Text style={styles.heading}>Recent</Text>
                  <Pressable accessibilityRole="button" onPress={() => forget(null)} style={styles.clear}><Text style={styles.clearText}>Clear all</Text></Pressable>
                </View>
                {recents.map((g) => row(g, undefined, (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${g.name} from recent`} onPress={() => forget(g.id)} style={styles.decline}>
                    <SymbolView name="xmark" size={13} tintColor={colors.searchMuted} />
                  </Pressable>
                )))}
              </>
            ) : !incoming.length ? <SearchNote>Search golfers by name or @username.</SearchNote> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { paddingHorizontal: gutter },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.searchLine },
  tab: { flex: 1, minHeight: minTap, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  tabOn: { borderBottomColor: colors.avatarGold },
  tabText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.searchMuted },
  tabTextOn: { color: colors.searchInk },
  content: { paddingHorizontal: gutter, paddingBottom: 140 },
  heading: { marginTop: 18, marginBottom: 6, fontFamily: fonts.bold, fontSize: 16, color: colors.searchInk },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clear: { minHeight: minTap, justifyContent: "center" },
  clearText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.avatarGold },
  answers: { flexDirection: "row", alignItems: "center", gap: 6 },
  accept: { minHeight: 32, paddingHorizontal: 14, justifyContent: "center", borderRadius: 999, backgroundColor: colors.goldBright },
  acceptText: { fontFamily: fonts.bold, fontSize: 13, color: colors.maroon900 },
  decline: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
