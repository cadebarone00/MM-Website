import { useState } from "react";
import { SymbolView } from "expo-symbols";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { gameDef, type GameId } from "@/lib/platform/roundGames";
import { GAME_GROUPS, playersLabel } from "@/lib/platform/roundSetupForm";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/** "Choose a game" + the game list in a native sheet, grouped as on the website (Points · Match & stroke · Team formats). */
export function GamePicker({ gameId, onPick }: { gameId: GameId | ""; onPick: (id: GameId | "") => void }) {
  const [open, setOpen] = useState(false);
  const def = gameId ? gameDef(gameId) : null;
  return (
    <>
      <View style={styles.pickRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={def ? `Game: ${def.name}. Change` : "Choose a game"} onPress={() => setOpen(true)} style={styles.pick}>
          <Text style={styles.pickName}>{def ? def.name : "Choose a game"}</Text>
          <Text style={styles.pickNote}>{def ? playersLabel(def.players) : "Optional"}</Text>
        </Pressable>
        {def && (
          <Pressable accessibilityRole="button" accessibilityLabel="No game" onPress={() => onPick("")} style={styles.clear}>
            <SymbolView name="xmark" size={15} tintColor={colors.wizardMuted} />
          </Pressable>
        )}
      </View>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.sheetTop}>
            <Text style={styles.sheetTitle}>Choose a game</Text>
            <SheetClose onPress={() => setOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {GAME_GROUPS.map((group) => (
              <View key={group.title} style={styles.group}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.ids.map((id) => {
                  const game = gameDef(id);
                  return (
                    <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: gameId === id }} onPress={() => { onPick(id); setOpen(false); }}
                      style={({ pressed }) => [styles.game, gameId === id && styles.gameOn, pressed && styles.pressed]}>
                      <Text style={styles.gameName}>{game.name}</Text>
                      <Text style={styles.gameBlurb}>{game.blurb} · {playersLabel(game.players)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pick: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  pickName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.cream },
  pickNote: { fontFamily: fonts.regular, fontSize: 13, color: colors.wizardMuted },
  clear: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  sheet: { flex: 1, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: 8 },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 22, color: colors.cream },
  list: { paddingHorizontal: gutter, paddingBottom: 32, gap: 18 },
  group: { gap: 8 },
  groupTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.avatarGold },
  game: { gap: 3, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.wizardLine, borderRadius: radius.control, backgroundColor: colors.wizardFill },
  gameOn: { borderColor: colors.gold, backgroundColor: "rgba(201,168,110,0.18)" },
  pressed: { opacity: 0.8 },
  gameName: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  gameBlurb: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.wizardMuted },
});
