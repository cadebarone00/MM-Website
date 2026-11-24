import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "~/lib/api.ts";
import { inviteLine, type InviteSummary } from "~/lib/play.ts";
import { useTabBadges } from "~/lib/tabBadges.tsx";
import { colors, fonts, minTap } from "~/lib/theme.ts";

/**
 * Play home: invites to friends' rounds ("Cam invited you to play Eagle Pointe · Skins"), as on the website. Join opens
 * the round; Decline drops it. Also keeps the Play tab's red badge equal to the number waiting. Refreshes when Play is shown.
 */
export function RoundInvites() {
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setPlay } = useTabBadges();

  const show = useCallback((list: InviteSummary[]) => { setInvites(list); setPlay(list.length); }, [setPlay]);

  useFocusEffect(useCallback(() => {
    let live = true;
    apiJson<{ invites?: InviteSummary[] }>("/api/rounds/invites").then((reply) => {
      if (live && reply.ok) show(Array.isArray(reply.body.invites) ? reply.body.invites : []);
    });
    return () => { live = false; };
  }, [show]));

  async function answer(roundId: string, join: boolean) {
    setBusy(roundId);
    setError(null);
    const reply = await apiJson(`/api/rounds/shared/${encodeURIComponent(roundId)}`, { method: "POST", body: { action: join ? "join" : "decline" } });
    setBusy(null);
    const rest = invites.filter((invite) => invite.roundId !== roundId);
    if (!reply.ok) { setError("That invite is no longer open."); show(rest); return; }
    show(rest);
    if (join) router.push({ pathname: "/rounds/[id]", params: { id: roundId } });
  }

  if (!invites.length && !error) return <Text style={styles.empty}>No round invites yet.</Text>;
  return (
    <View style={styles.list} accessibilityLabel="Round invites">
      {invites.map((invite) => {
        const line = inviteLine(invite);
        return (
          <View key={invite.roundId} style={styles.invite}>
            <Text style={styles.text}>
              <Text style={styles.bold}>{line.host}</Text> invited you to play <Text style={styles.bold}>{line.course}</Text>{line.game ? ` · ${line.game}` : ""}
            </Text>
            <View style={styles.buttons}>
              <Pressable accessibilityRole="button" disabled={busy === invite.roundId} onPress={() => answer(invite.roundId, true)} style={[styles.button, styles.join]}>
                <Text style={[styles.buttonText, styles.joinText]}>Join</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy === invite.roundId} onPress={() => answer(invite.roundId, false)} style={styles.button}>
                <Text style={styles.buttonText}>Decline</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk },
  list: { gap: 10 },
  invite: { gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.boardBorder, borderRadius: 14, backgroundColor: colors.inviteFill },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.homeCream },
  bold: { fontFamily: fonts.bold },
  buttons: { flexDirection: "row", gap: 8 },
  button: { minHeight: minTap - 2, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.boardBorder, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  join: { backgroundColor: colors.homeCream, borderColor: colors.homeCream },
  buttonText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.homeCream },
  joinText: { color: colors.maroon950 },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.errorOnMaroon },
});
