import { useState } from "react";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PersonalRoundSetup } from "@/lib/platform/personalRound";
import { movedOrder, orderLocked, orderMatters, shuffledOrder, type BoardPerson } from "@/lib/platform/roundBoard";
import type { HoleInput } from "@/lib/platform/roundGames";
import { changedGame, firstName, MAX_ROUND_PLAYERS } from "@/lib/platform/roundSetupForm";
import type { SharedRound } from "@/lib/platform/sharedRoundTypes";
import { CodeCard } from "~/components/CodeCard.tsx";
import { GamePicker } from "~/components/setup/GamePicker.tsx";
import { AddGuest, InvitePlayer } from "~/components/setup/PlayersEditor.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { newGuestId } from "~/lib/setupHelpers.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type HostAction = (body: { action: string } & Record<string, unknown>) => Promise<boolean>;

/**
 * Round settings, behind the gear (website PlayRound's Round settings; Cancel round spec 2026-11-22): the players
 * (remove), Add players · Change game (scorekeeper), the Wolf / playing order before the first hole, the invite code,
 * and the way out — the scorekeeper's Cancel round (Save & exit / Delete round), a friend's Leave round.
 */
export function RoundSettings({ open, onClose, round, me, inviteCode, ordered, inputs, gameFits, onAction, onExit }: {
  open: boolean; onClose: () => void; round: SharedRound; me: string; inviteCode: string | null; ordered: BoardPerson[]; inputs: HoleInput[];
  gameFits: boolean; onAction: HostAction;
  /** Leave the round screen; `clear` = forget this phone's copy (Delete / Leave), not on Save & exit. */
  onExit: (clear: boolean) => void;
}) {
  const [menu, setMenu] = useState<null | "players" | "game">(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { setup } = round;
  const isHost = round.host === me;
  const ended = round.status === "ended";
  const active = round.players.filter((p) => p.status === "invited" || p.status === "joined").sort((a, b) => a.position - b.position);
  const guests = setup.guests ?? [];
  const room = active.length + guests.length < MAX_ROUND_PLAYERS;
  const locked = orderLocked(ordered.map((p) => p.strokes), inputs);
  const editOrder = isHost && !locked && !ended;
  const setSetup = (next: PersonalRoundSetup) => onAction({ action: "setup", setup: next });
  const setOrder = (keys: string[]) => void setSetup({ ...setup, playerOrder: keys });
  const confirm = (title: string, message: string, then: () => void, destructive = "Remove") =>
    Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: destructive, style: "destructive", onPress: then }]);

  async function deleteRound() {
    if (await onAction({ action: "delete" })) onExit(true);
  }
  async function leaveRound() {
    const dropOut = !isHost && !ended;
    confirm(dropOut ? "Leave this round?" : "Leave this round on this phone?",
      dropOut ? "You'll drop out, and it won't be saved to your profile. Scores already in it stay in the host's round." : "Scores already sent stay in the round.",
      async () => { if (!dropOut || await onAction({ action: "leave" })) onExit(true); }, "Leave");
  }

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet} edges={["bottom"]}>
        <View style={styles.top}>
          <Text style={styles.title}>Round settings</Text>
          <SheetClose onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{active.length + guests.length} players</Text>
          <View style={styles.roster}>
            {active.map((p) => (
              <Row key={p.profileId} name={p.profileId === me ? "You" : p.name} note={p.profileId === round.host ? "Scorekeeper" : undefined} status={p.status === "joined" ? "Joined" : "Invited"}
                onRemove={isHost && p.profileId !== me && !ended ? () => confirm(p.status === "invited" ? `Cancel ${p.name}'s invite?` : `Remove ${p.name} from the round?`, "",
                  () => void onAction({ action: "remove", profileId: p.profileId })) : undefined} />
            ))}
            {guests.map((g) => (
              <Row key={g.id} name={g.name} status="Guest"
                onRemove={isHost && !ended ? () => confirm(`Remove ${g.name} from the round?`, "", () => void setSetup({ ...setup, guests: guests.filter((x) => x.id !== g.id) })) : undefined} />
            ))}
          </View>

          {isHost && !ended && (
            <>
              <View style={styles.hostMenu}>
                <MenuButton label="Add players" on={menu === "players"} onPress={() => setMenu(menu === "players" ? null : "players")} />
                <MenuButton label="Change game" on={menu === "game"} onPress={() => setMenu(menu === "game" ? null : "game")} />
              </View>
              {menu === "players" && (room ? (
                <View style={styles.form}>
                  <InvitePlayer taken={active.map((p) => p.profileId)} onInvite={(player) => { if (player.profileId) void onAction({ action: "invite", profileId: player.profileId }); setMenu(null); }} />
                  <AddGuest onAdd={(name) => { void setSetup({ ...setup, guests: [...guests, { id: newGuestId(), name, handicap: null }] }); setMenu(null); }} />
                </View>
              ) : <Text style={styles.note}>A round has up to 5 players, guests included.</Text>)}
              {menu === "game" && (
                <GamePicker gameId={setup.game?.id ?? ""} onPick={(gameId) => { void setSetup(changedGame(setup, gameId)); setMenu(null); }} />
              )}
            </>
          )}

          {orderMatters(setup.game?.id) && gameFits && (
            <View style={styles.orderBox}>
              <View style={styles.orderHead}>
                <Text style={styles.label}>{setup.game?.id === "wolf" ? "Wolf order" : "Playing order"}</Text>
                {editOrder && <MenuButton label="Randomize" on={false} onPress={() => setOrder(shuffledOrder(ordered.map((x) => x.key)))} small />}
              </View>
              {ordered.map((x, i) => (
                <View key={x.key} style={styles.orderRow}>
                  <Text style={styles.orderNum}>{i + 1}</Text>
                  <Text style={styles.orderName} numberOfLines={1}>{x.name}</Text>
                  {editOrder && (
                    <>
                      <Arrow label={`Move ${x.name} up`} name="chevron.up" disabled={i === 0} onPress={() => setOrder(movedOrder(ordered.map((o) => o.key), i, i - 1))} />
                      <Arrow label={`Move ${x.name} down`} name="chevron.down" disabled={i === ordered.length - 1} onPress={() => setOrder(movedOrder(ordered.map((o) => o.key), i, i + 1))} />
                    </>
                  )}
                </View>
              ))}
              <Text style={styles.note}>{locked ? "The order is set once the first hole is scored." : setup.game?.id === "wolf" ? "The Wolf goes in this order, starting on the first hole." : "Partners change every 6 holes in this order."}</Text>
            </View>
          )}

          {inviteCode && !ended && room && <CodeCard kind="round" code={inviteCode} name={setup.course.name} />}

          <Text style={styles.note}>{isHost ? "Pull up Scoring to enter each hole. Submit & Save is on the Card once every hole is in."
            : `${firstName(active.find((p) => p.profileId === round.host)?.name ?? "The host")} is keeping score. When they submit, this round is saved to your profile.`}</Text>

          {isHost && !ended ? (
            cancelOpen ? (
              <View style={styles.cancelBox}>
                <Text style={styles.note}>Save &amp; exit keeps every score, so you can finish later from Play. Delete round erases the round.</Text>
                <Wide label="Save & exit" onPress={() => { onClose(); onExit(false); }} />
                <Wide label="Delete round" danger onPress={() => confirm("Delete this round?", "Every score in it is erased for everyone in it, guests too. This can't be undone.", () => void deleteRound(), "Delete")} />
                <Pressable accessibilityRole="button" onPress={() => setCancelOpen(false)} style={styles.textButton}><Text style={styles.textButtonText}>Keep playing</Text></Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => setCancelOpen(true)} style={styles.textButton}><Text style={styles.textButtonText}>Cancel round</Text></Pressable>
            )
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void leaveRound()} style={styles.textButton}>
              <Text style={styles.textButtonText}>{isHost || ended ? "Leave round on this phone" : "Leave round"}</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Row({ name, note, status, onRemove }: { name: string; note?: string; status: string; onRemove?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      <Text style={[styles.status, status === "Joined" && styles.joined]}>{status}</Text>
      {onRemove && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name}`} onPress={onRemove} style={styles.remove}>
          <SymbolView name="xmark" size={14} tintColor={colors.wizardMuted} />
        </Pressable>
      )}
    </View>
  );
}

function MenuButton({ label, on, onPress, small = false }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      style={[small ? styles.menuSmall : styles.menu, on && styles.menuOn]}>
      <Text style={[styles.menuText, on && styles.menuTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Arrow({ label, name, disabled, onPress }: { label: string; name: "chevron.up" | "chevron.down"; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.arrow, disabled && styles.off]}>
      <SymbolView name={name} size={14} tintColor={colors.cream} />
    </Pressable>
  );
}

function Wide({ label, danger = false, onPress }: { label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.wide, danger && styles.danger, pressed && styles.pressed]}>
      <Text style={[styles.wideText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: 8 },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  body: { paddingHorizontal: gutter, paddingBottom: 40, gap: 12 },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 1.2, color: colors.avatarGold },
  roster: { gap: 6 },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  rowNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.wizardMuted },
  status: { fontFamily: fonts.semibold, fontSize: 13, color: colors.wizardMuted },
  joined: { color: "#b9e0b0" },
  remove: { width: minTap, height: minTap, marginRight: -8, alignItems: "center", justifyContent: "center" },
  hostMenu: { flexDirection: "row", gap: 8 },
  menu: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1, borderColor: colors.gold },
  menuSmall: { minHeight: 34, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.gold },
  menuOn: { backgroundColor: colors.gold },
  menuText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.goldBright },
  menuTextOn: { color: colors.maroon900 },
  form: { gap: 10 },
  orderBox: { gap: 8, padding: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine },
  orderHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  orderNum: { width: 24, fontFamily: fonts.bold, fontSize: 15, color: colors.avatarGold },
  orderName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  arrow: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: colors.wizardLine },
  off: { opacity: 0.35 },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.wizardMuted },
  cancelBox: { gap: 10, padding: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.wizardLine },
  wide: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1, borderColor: colors.gold },
  wideText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.goldBright },
  danger: { backgroundColor: colors.error, borderColor: colors.error },
  dangerText: { color: colors.white },
  pressed: { opacity: 0.85 },
  textButton: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  textButtonText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.errorOnMaroon, textDecorationLine: "underline" },
});
