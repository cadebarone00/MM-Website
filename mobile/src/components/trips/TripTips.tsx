import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { coachStops } from "@/lib/platform/coachMarks";
import { hasSeen, markSeen, TIPS_SEEN_KEY } from "@/lib/platform/tripTour";
import { loadSeenStore, seenStore } from "~/lib/tripDraft.ts";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts } from "~/lib/theme.ts";

/** The existing first-visit tips, stored once per account on this device. */
export function TripTips({ profileId, organizer }: { profileId: string; organizer: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  const stops = coachStops(organizer);
  useEffect(() => {
    let live = true;
    void loadSeenStore([TIPS_SEEN_KEY]).then(() => { if (live && !hasSeen(TIPS_SEEN_KEY, profileId, seenStore)) setIndex(0); });
    return () => { live = false; };
  }, [profileId]);
  const finish = () => { markSeen(TIPS_SEEN_KEY, profileId, seenStore); setIndex(null); };
  return <Modal visible={index !== null} transparent animationType="none" onRequestClose={finish}><View style={styles.backdrop}><View style={styles.box} accessibilityViewIsModal><View style={styles.head}><Text style={styles.title}>Trip tips</Text><SheetClose onPress={finish} /></View><Text style={styles.body}>{index === null ? "" : stops[index]?.text}</Text><View style={styles.actions}>{index !== null && index > 0 && <Pressable onPress={() => setIndex(index - 1)}><Text style={styles.action}>Back</Text></Pressable>}<Pressable onPress={() => { if (index === null) return; if (index + 1 >= stops.length) finish(); else setIndex(index + 1); }}><Text style={styles.action}>{index !== null && index + 1 >= stops.length ? "Done" : "Next"}</Text></Pressable></View></View></View></Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.sheetBackdrop }, box: { padding: 20, borderRadius: 16, backgroundColor: colors.maroon900, gap: 20 }, head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { color: colors.cream, fontFamily: fonts.bold, fontSize: 22 }, body: { color: colors.cream, fontFamily: fonts.regular, fontSize: 17 }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: 24 }, action: { color: colors.goldBright, fontFamily: fonts.semibold, fontSize: 16, padding: 8 } });
