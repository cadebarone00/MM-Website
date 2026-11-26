import { useState } from "react";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { befriend, friendLabel, unfriend, type Relation } from "~/lib/friends.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

/** A search row's end (website ProfileSearch friendButton): ✓ Friends · Requested · Accept · Add. */
export function RowFriendButton({ relation, busy, onAdd }: { relation: Relation; busy: boolean; onAdd: () => void }) {
  if (relation === "friends") return <View style={[styles.badge, styles.badgeFriends]}><SymbolView name="checkmark" size={12} tintColor={colors.maroon900} /><Text style={styles.badgeText}>Friends</Text></View>;
  if (relation === "requested") return <View style={styles.badge}><Text style={styles.badgeTextLight}>Requested</Text></View>;
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { Haptics.selectionAsync().catch(() => {}); onAdd(); }} style={[styles.add, busy && styles.off]}>
      {busy ? <ActivityIndicator size="small" color={colors.maroon900} /> : <Text style={styles.addText}>{relation === "incoming" ? "Accept" : "Add"}</Text>}
    </Pressable>
  );
}

/**
 * The friend toggle on someone's profile (website FriendToggle): ✓ Friends → tap to stop being friends; Add friend →
 * ask (→ Requested, or Friends if they'd asked); Requested → take it back; Accept → they asked me. A golf-trip mate's
 * friendship comes from the trip, so it doesn't switch off.
 */
export function FriendToggle({ profileId, initial, tripMate }: { profileId: string; initial: Relation; tripMate: boolean }) {
  const [relation, setRelation] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function toggle() {
    if (busy || (relation === "friends" && tripMate)) return;
    const off = relation === "friends" || relation === "requested";
    setBusy(true); setProblem(null);
    const reply = off ? await unfriend(profileId) : await befriend(profileId);
    setBusy(false);
    if (reply.ok) setRelation(reply.relation); else setProblem(reply.error);
  }
  const on = relation === "friends";
  return (
    <View style={styles.flex}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} disabled={busy} onPress={() => { Haptics.selectionAsync().catch(() => {}); void toggle(); }}
        style={[styles.toggle, on && styles.toggleOn]}>
        {busy ? <ActivityIndicator size="small" color={colors.cream} /> : (
          <>
            <SymbolView name={on ? "person.fill.checkmark" : relation === "requested" ? "clock" : "person.badge.plus"} size={15} tintColor={on ? colors.maroon900 : colors.cream} />
            <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{friendLabel(relation, tripMate)}</Text>
          </>
        )}
      </Pressable>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  off: { opacity: 0.5 },
  badge: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.searchField },
  badgeFriends: { backgroundColor: colors.avatarGold },
  badgeText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.maroon900 },
  badgeTextLight: { fontFamily: fonts.semibold, fontSize: 13, color: colors.searchMuted },
  add: { minHeight: 32, minWidth: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.goldBright },
  addText: { fontFamily: fonts.bold, fontSize: 13, color: colors.maroon900 },
  toggle: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, backgroundColor: "rgba(251,248,241,0.12)" },
  toggleOn: { backgroundColor: colors.avatarGold },
  toggleText: { fontFamily: fonts.bold, fontSize: 14, color: colors.cream },
  toggleTextOn: { color: colors.maroon900 },
  problem: { marginTop: 4, fontFamily: fonts.regular, fontSize: 12, color: colors.errorOnMaroon },
});
