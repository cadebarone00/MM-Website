import { useEffect, useState } from "react";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { RoundGuest, RoundPlayer } from "@/lib/platform/personalRound";
import { MAX_ROUND_PLAYERS } from "@/lib/platform/roundSetupForm";
import { Avatar } from "~/components/Avatar.tsx";
import { apiJson } from "~/lib/api.ts";
import { guestName, newGuestId } from "~/lib/setupHelpers.ts";
import { colors, fonts, minTap, radius } from "~/lib/theme.ts";

type Account = { id: string; name: string; username: string };

/**
 * Who's playing (website Players page): You (scorekeeper), friends with the app (search Maroon accounts → they get an
 * invite in the app) and guests by name (you keep their score). Up to 5 in all.
 */
export function PlayersEditor({ players, guests, onPlayers, onGuests }: {
  players: RoundPlayer[]; guests: RoundGuest[]; onPlayers: (next: RoundPlayer[]) => void; onGuests: (next: RoundGuest[]) => void;
}) {
  const size = players.length + guests.length + 1;
  return (
    <View style={styles.wrap}>
      <View style={styles.list}>
        <Row name="You" note="Scorekeeper" />
        {players.map((player, i) => (
          <Row key={player.profileId ?? i} name={player.name} note="Gets an invite in the app" onRemove={() => onPlayers(players.filter((_, j) => j !== i))} removeLabel={`Don't invite ${player.name}`} />
        ))}
        {guests.map((guest, i) => (
          <Row key={guest.id} name={guest.name} note="Guest · you keep their score" onRemove={() => onGuests(guests.filter((_, j) => j !== i))} removeLabel={`Remove ${guest.name}`} />
        ))}
      </View>
      {size < MAX_ROUND_PLAYERS ? (
        <>
          <InvitePlayer taken={players.flatMap((p) => p.profileId ? [p.profileId] : [])} onInvite={(player) => onPlayers([...players, player])} />
          <AddGuest onAdd={(name) => onGuests([...guests, { id: newGuestId(), name, handicap: null }])} />
        </>
      ) : <Text style={styles.note}>A round has up to 5 players.</Text>}
    </View>
  );
}

function Row({ name, note, onRemove, removeLabel }: { name: string; note: string; onRemove?: () => void; removeLabel?: string }) {
  return (
    <View style={styles.row}>
      <Avatar name={name} size={36} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        <Text style={styles.rowNote}>{note}</Text>
      </View>
      {onRemove && (
        <Pressable accessibilityRole="button" accessibilityLabel={removeLabel} onPress={onRemove} style={styles.remove}>
          <SymbolView name="xmark" size={14} tintColor={colors.wizardMuted} />
        </Pressable>
      )}
    </View>
  );
}

/** Search Maroon accounts by name (accounts only), a moment after typing stops (website InvitePlayer). */
export function InvitePlayer({ taken, onInvite }: { taken: string[]; onInvite: (player: RoundPlayer) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Account[]>([]);
  const [searched, setSearched] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const text = query.trim();

  useEffect(() => {
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const reply = await apiJson<{ accounts?: Account[] }>(`/api/account/search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
      if (!reply.ok && reply.code === "aborted") return;
      if (!reply.ok) { setProblem(reply.error); return; }
      setProblem(null);
      setFound(Array.isArray(reply.body.accounts) ? reply.body.accounts : []);
      setSearched(text);
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [text]);

  const results = text.length < 2 ? [] : found.filter((account) => !taken.includes(account.id));
  return (
    <View style={styles.block}>
      <View style={styles.inputBox}>
        <SymbolView name="magnifyingglass" size={15} tintColor={colors.wizardMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Invite a player: search by name" placeholderTextColor={colors.wizardDisabledInk}
          autoCorrect={false} autoCapitalize="words" accessibilityLabel="Invite a player" style={styles.input} />
      </View>
      {results.map((account) => (
        <Pressable key={account.id} accessibilityRole="button" accessibilityLabel={`Invite ${account.name}`} style={({ pressed }) => [styles.result, pressed && styles.pressed]}
          onPress={() => { onInvite({ name: account.name, profileId: account.id, handicap: null }); setQuery(""); setFound([]); }}>
          <Avatar name={account.name} size={32} />
          <View style={styles.rowText}>
            <Text style={styles.rowName} numberOfLines={1}>{account.name}</Text>
            <Text style={styles.rowNote}>@{account.username}</Text>
          </View>
          <Text style={styles.invite}>Invite</Text>
        </Pressable>
      ))}
      {problem && text.length >= 2 ? <Text style={styles.error}>{problem}</Text> : null}
      {text.length >= 2 && searched === text && results.length === 0 && !problem
        ? <Text style={styles.note}>No Maroon accounts match “{text}”. Players need an account to be invited.</Text> : null}
    </View>
  );
}

/** Someone playing without the app: their score stays on this round only (website AddGuest). */
export function AddGuest({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const text = guestName(name);
  const add = () => { if (text) { onAdd(text); setName(""); } };
  return (
    <View style={styles.guestRow}>
      <View style={[styles.inputBox, styles.flex]}>
        <TextInput value={name} onChangeText={setName} placeholder="Add a guest: their name" placeholderTextColor={colors.wizardDisabledInk}
          maxLength={40} returnKeyType="done" onSubmitEditing={add} autoCapitalize="words" accessibilityLabel="Guest's name" style={styles.input} />
      </View>
      <Pressable accessibilityRole="button" disabled={!text} onPress={add} style={[styles.addGuest, !text && styles.disabled]}>
        <Text style={styles.addGuestText}>Add guest</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  list: { gap: 6 },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  rowNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  remove: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center", marginRight: -8 },
  block: { gap: 6 },
  inputBox: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  input: { flex: 1, minHeight: 44, fontFamily: fonts.regular, fontSize: 16, color: colors.cream },
  result: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: radius.control, backgroundColor: "rgba(201,168,110,0.14)" },
  pressed: { opacity: 0.8 },
  invite: { fontFamily: fonts.semibold, fontSize: 15, color: colors.goldBright },
  guestRow: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  addGuest: { minHeight: 48, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.gold, borderRadius: radius.control },
  addGuestText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.goldBright },
  disabled: { opacity: 0.45 },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.wizardMuted },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.errorOnMaroon },
});
