import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Share, StyleSheet, Text, View } from "react-native";
import { formatCode } from "@/lib/platform/codeTournaments";
import { joinPath, KIND_NAME, type InviteKind } from "@/lib/platform/codeInvites";
import { Button } from "./Button.tsx";
import { Card } from "./Card.tsx";
import { shareUrl } from "~/lib/api.ts";
import { colors, fonts } from "~/lib/theme.ts";

/**
 * The big invite code with Copy and Share (the iOS share sheet, with a link to the website's Join page, which opens the
 * app once app links are set up). Same code format and links as the website's InviteCodeCard.
 */
export function CodeCard({ kind, code, name }: { kind: InviteKind; code: string; name: string }) {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = (text: string) => {
    setNote(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 1800);
  };
  const shown = formatCode(code);
  const link = shareUrl(joinPath(kind, code));

  async function copy() {
    try { await Clipboard.setStringAsync(shown); flash("Code copied"); } catch { flash("Couldn't copy. Write the code down instead."); }
  }
  async function share() {
    try { await Share.share({ message: `Join my ${KIND_NAME[kind]} "${name}" on Balata with code ${shown}: ${link}` }); }
    catch { flash("Couldn't open sharing. Copy the code instead."); }
  }

  return (
    <Card tone="dark">
      <Text style={styles.caption}>Invite code</Text>
      <Text style={styles.code} accessibilityLabel={`Invite code ${code.split("").join(" ")}`} selectable>{shown}</Text>
      <View style={styles.actions}>
        <Button label="Copy" variant="primary" onPress={copy} style={styles.action} />
        <Button label="Share" variant="secondaryOnDark" onPress={share} style={styles.action} />
      </View>
      {/* Fixed-height note line so the card doesn't grow when it appears. */}
      <Text style={styles.note} accessibilityLiveRegion="polite">{note ?? " "}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  caption: { fontFamily: fonts.semibold, fontSize: 14, color: colors.searchMuted, textAlign: "center" },
  code: { fontFamily: fonts.bold, fontSize: 40, letterSpacing: 4, color: colors.goldBright, textAlign: "center", marginVertical: 8 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  note: { marginTop: 8, height: 20, textAlign: "center", fontFamily: fonts.regular, fontSize: 14, color: colors.searchMuted },
});
