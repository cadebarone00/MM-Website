import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { Avatar } from "~/components/Avatar.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Message = { id: number; text: string; createdAt: number };
type Thread = { id: string; name: string; messages: Message[] };
const TRIP = "trip";

/**
 * The trip header's Chat (website GolfTripChat): Trip Chat pinned, direct chats with group members, search. Memory only,
 * like the website: no delivery or storage, gone when the trip page closes (project_specs.md Golf Trips part 2c).
 */
export function TripChat({ open, onClose, tripName, members }: { open: boolean; onClose: () => void; tripName: string; members: string[] }) {
  const [threads, setThreads] = useState<Thread[]>([{ id: TRIP, name: "Trip Chat", messages: [] }]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const active = threads.find((t) => t.id === selected);
  const draft = selected ? drafts[selected] ?? "" : "";

  const close = () => { setSelected(null); setQuery(""); onClose(); };
  const start = (name: string) => {
    const id = `member:${name}`;
    setThreads((list) => list.some((t) => t.id === id) ? list : [...list, { id, name, messages: [] }]);
    setSelected(id); setQuery("");
  };
  const send = () => {
    const text = draft.trim();
    if (!text || !selected) return;
    const now = Date.now();
    setThreads((list) => list.map((t) => t.id === selected ? { ...t, messages: [...t.messages, { id: now, text, createdAt: now }] } : t));
    setDrafts((all) => ({ ...all, [selected]: "" }));
  };
  const found = [...new Set(members)].filter((name) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const inbox = [threads[0], ...threads.slice(1).filter((t) => t.messages.length > 0).sort((a, b) => b.messages.at(-1)!.createdAt - a.messages.at(-1)!.createdAt)];

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.page} edges={["bottom"]}>
        <View style={styles.header}>
          <View style={{ width: minTap }}>{active && <Pressable accessibilityRole="button" accessibilityLabel="Back to chats" onPress={() => setSelected(null)} style={styles.icon}><SymbolView name="chevron.left" size={20} tintColor={colors.cream} /></Pressable>}</View>
          <Text style={styles.trip} numberOfLines={1}>{tripName}</Text>
          <SheetClose onPress={close} />
        </View>
        <View style={styles.chatHeading}>
          {active && (active.id === TRIP ? <View style={styles.group}><SymbolView name="person.3.fill" size={18} tintColor={colors.avatarGold} /></View> : <Avatar name={active.name} size={42} />)}
          <Text style={styles.chatName} accessibilityRole="header">{active?.name ?? "Chats"}</Text>
        </View>
        {active ? (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={60}>
            <ScrollView ref={scroll} contentContainerStyle={styles.messages} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} accessibilityLabel={`${active.name} messages`}>
              {active.messages.length === 0 && <View style={styles.welcome}>
                <SymbolView name="message" size={28} tintColor={colors.avatarGold} />
                <Text style={styles.welcomeTitle}>{active.id === TRIP ? "Everyone. One conversation." : `Say hello to ${active.name.split(" ")[0]}.`}</Text>
                <Text style={styles.muted}>{active.id === TRIP ? "Tee times, dinner plans, and everything in between." : "Start your conversation with a message below."}</Text>
              </View>}
              {active.messages.map((m, i) => {
                const day = new Date(m.createdAt).toLocaleDateString();
                const prev = i ? new Date(active.messages[i - 1].createdAt).toLocaleDateString() : "";
                return <View key={`${m.id}-${i}`}>
                  {day !== prev && <Text style={styles.date}>{day === new Date().toLocaleDateString() ? "Today" : day}</Text>}
                  <View style={styles.bubble}><Text style={styles.bubbleText}>{m.text}</Text>
                    <Text style={styles.time}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text></View>
                </View>;
              })}
            </ScrollView>
            <View style={styles.composer}>
              <TextInput style={styles.input} placeholder="Message" placeholderTextColor={colors.searchFaint} maxLength={4000} value={draft} accessibilityLabel="Message"
                onChangeText={(v) => setDrafts((all) => ({ ...all, [active.id]: v }))} onSubmitEditing={send} returnKeyType="send" />
              <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim()} onPress={send} style={[styles.send, !draft.trim() && { opacity: 0.4 }]}>
                <SymbolView name="paperplane.fill" size={18} tintColor={colors.maroon900} /></Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: gutter, gap: 8 }} keyboardShouldPersistTaps="handled">
            <View style={styles.search}><SymbolView name="magnifyingglass" size={16} tintColor={colors.searchMuted} />
              <TextInput style={styles.searchInput} placeholder="Find someone in your group" placeholderTextColor={colors.searchFaint} value={query} onChangeText={setQuery} accessibilityLabel="Find someone in your group" /></View>
            <View style={styles.columns}><Text style={styles.columnLabel}>Conversation</Text><Text style={styles.columnLabel}>Messages</Text></View>
            {inbox.map((t, i) => <Row key={t.id} title={t.name} sub={t.messages.at(-1)?.text ?? "Your whole group, together"} rank={t.id === TRIP ? null : String(i).padStart(2, "0")} group={t.id === TRIP} onPress={() => setSelected(t.id)} />)}
            {query.trim() ? <View accessibilityLabel="Group members">
              <Text style={styles.resultsTitle}>In your group</Text>
              {found.map((name) => <Row key={name} title={name} sub="Start a conversation" onPress={() => start(name)} />)}
              {!found.length && <Text style={styles.muted}>No group members match “{query}”.</Text>}
            </View> : inbox.length === 1 && <View style={styles.welcome}>
              <Text style={styles.welcomeTitle}>Your conversations will appear here.</Text><Text style={styles.muted}>Find someone in your group to start a chat.</Text>
            </View>}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Row({ title, sub, rank, group = false, onPress }: { title: string; sub: string; rank?: string | null; group?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      {rank !== undefined && <View style={{ width: 22 }}>{rank === null ? <SymbolView name="pin.fill" size={14} tintColor={colors.avatarGold} accessibilityLabel="Pinned" /> : <Text style={styles.rank}>{rank}</Text>}</View>}
      {group ? <View style={styles.group}><SymbolView name="person.3.fill" size={16} tintColor={colors.avatarGold} /></View> : <Avatar name={title} size={42} />}
      <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.rowTitle} numberOfLines={1}>{title}</Text><Text style={styles.muted} numberOfLines={1}>{sub}</Text></View>
      <SymbolView name="chevron.right" size={14} tintColor={colors.searchMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, paddingTop: 12, minHeight: 56 },
  icon: { width: minTap, height: minTap, justifyContent: "center" },
  trip: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  chatHeading: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: gutter, paddingBottom: 8 },
  chatName: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  group: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.avatarRing, backgroundColor: colors.avatarFill, alignItems: "center", justifyContent: "center" },
  messages: { padding: gutter, gap: 8, flexGrow: 1 },
  welcome: { alignItems: "center", gap: 6, paddingVertical: 32 },
  welcomeTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream, textAlign: "center" },
  muted: { fontFamily: fonts.regular, fontSize: 14, color: colors.searchMuted, textAlign: "left" },
  date: { alignSelf: "center", marginVertical: 8, fontFamily: fonts.semibold, fontSize: 12, color: colors.searchMuted },
  bubble: { alignSelf: "flex-end", maxWidth: "80%", padding: 10, borderRadius: 16, backgroundColor: colors.cream, gap: 2 },
  bubbleText: { fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  time: { alignSelf: "flex-end", fontFamily: fonts.regular, fontSize: 11, color: colors.inkMuted },
  composer: { flexDirection: "row", gap: 8, padding: gutter, borderTopWidth: 1, borderTopColor: colors.searchLine },
  input: { flex: 1, minHeight: minTap, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.searchField, fontFamily: fonts.regular, fontSize: 16, color: colors.searchInk },
  send: { width: minTap, height: minTap, borderRadius: 22, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: minTap, paddingHorizontal: 12, borderRadius: radius.control, backgroundColor: colors.searchField },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.searchInk },
  columns: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  columnLabel: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.8, color: colors.searchFaint, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60, borderBottomWidth: 1, borderBottomColor: colors.searchLine },
  rank: { fontFamily: fonts.bold, fontSize: 13, color: colors.avatarGold },
  rowTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.searchInk },
  resultsTitle: { marginTop: 14, marginBottom: 4, fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
});
