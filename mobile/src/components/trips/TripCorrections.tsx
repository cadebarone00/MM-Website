import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { correctionView, type TripCorrections } from "@/lib/platform/tripCorrections";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

type Act = (body: Record<string, unknown>) => Promise<{ ok: boolean; message: string }>;
const holeList = (holes: number[]) => holes.length === 1 ? `Hole ${holes[0]}` : `Holes ${holes.join(", ")}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

/**
 * Scorecard corrections on the scoring sheet's Card (project_specs.md Golf Trips part 2d slice 4; website Step 6):
 *   - my submitted card: Request a correction (pick holes + a reason), then its status and the organizer's decision;
 *   - the organizer: each pending request with Approve / Deny (a note is optional to approve, required to deny);
 *   - my submission history (revision 1, then each corrected resubmission).
 * Approving reopens only those holes; the golfer fixes them, the attester enters them again, then Submit & Save. The
 * database enforces every rule; Trip Settings → Corrections (any day) is part 2g.
 */
export function TripCorrectionsPanel({ corrections, profileId, groupId, submitted, act }: {
  corrections: TripCorrections; profileId: string; groupId: string; submitted: boolean; act: Act;
}) {
  const view = correctionView(corrections, profileId);
  const [asking, setAsking] = useState(false);
  const [deciding, setDeciding] = useState<{ id: string; name: string; approve: boolean } | null>(null);
  const mine = view.myRequest;
  const open = mine && (mine.status === "pending" || mine.status === "approved");
  return <View style={styles.wrap} accessibilityLabel="Corrections">
    {mine && <View style={styles.box}>
      <Text style={styles.title}>Your correction request</Text>
      <Text style={styles.text}>{holeList(mine.holes)} · “{mine.reason}”</Text>
      <Text style={[styles.text, mine.status === "denied" ? styles.bad : mine.status === "approved" ? styles.good : null]}>
        {mine.status === "pending" ? "Waiting for the organizer to decide."
          : mine.status === "approved" ? `Approved${mine.decidedByName ? ` by ${mine.decidedByName}` : ""}. Fix ${mine.holes.length === 1 ? "that hole" : "those holes"}, have your attester enter ${mine.holes.length === 1 ? "it" : "them"} again, then Submit & Save.`
          : mine.status === "denied" ? `Denied${mine.decidedByName ? ` by ${mine.decidedByName}` : ""}. Your submitted card stands.`
          : "Corrected and resubmitted."}
      </Text>
      {mine.decisionNote && <Text style={styles.text}>Note: {mine.decisionNote}</Text>}
    </View>}
    {submitted && !open && <Pressable accessibilityRole="button" onPress={() => setAsking(true)} style={styles.button}><Text style={styles.buttonText}>Request a correction</Text></Pressable>}

    {view.pending.length > 0 && <View style={styles.box}>
      <Text style={styles.title}>Correction requests to decide</Text>
      {view.pending.map((r) => <View key={r.id} style={styles.request}>
        <Text style={styles.text}><Text style={styles.strong}>{r.name}</Text> · {holeList(r.holes)}</Text>
        <Text style={styles.text}>“{r.reason}”</Text>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => setDeciding({ id: r.id, name: r.name, approve: true })} style={styles.small}><Text style={styles.smallText}>Approve</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDeciding({ id: r.id, name: r.name, approve: false })} style={styles.small}><Text style={styles.smallText}>Deny</Text></Pressable>
        </View>
      </View>)}
    </View>}

    {view.revisions.length > 0 && <View style={styles.box}>
      <Text style={styles.title}>Submission history</Text>
      {view.revisions.map((r) => <Text key={r.revision} style={styles.text}>
        {r.revision === 1 ? "Submitted" : `Correction ${r.revision - 1}`} · {when(r.submittedAt)}{r.isCurrent ? " · current" : ""}{r.reason ? ` · “${r.reason}”` : ""} · {r.card.reduce((n, h) => n + (h.strokes ?? 0), 0)}
      </Text>)}
    </View>}

    {asking && <RequestSheet onClose={() => setAsking(false)} onSend={async (holes, reason) => {
      const result = await act({ action: "request", groupId, golferProfileId: profileId, holes, reason });
      if (result.ok) setAsking(false); else Alert.alert("Not sent", result.message);
    }} />}
    {deciding && <DecideSheet {...deciding} onClose={() => setDeciding(null)} onSend={async (note) => {
      const result = await act({ action: "decide", requestId: deciding.id, approve: deciding.approve, note });
      if (result.ok) setDeciding(null); else Alert.alert("Not saved", result.message);
    }} />}
  </View>;
}

function RequestSheet({ onClose, onSend }: { onClose: () => void; onSend: (holes: number[], reason: string) => Promise<void> }) {
  const [holes, setHoles] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = holes.length > 0 && reason.trim().length >= 3 && reason.trim().length <= 500;
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.page} edges={["bottom"]}>
      <View style={styles.top}><Text style={styles.pageTitle}>Request a correction</Text><SheetClose onPress={onClose} /></View>
      <ScrollView contentContainerStyle={{ padding: gutter, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.onDark}>Pick the holes that are wrong. The organizer decides; if they approve, only those holes reopen.</Text>
        <View style={styles.holes}>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
            const on = holes.includes(h);
            return <Pressable key={h} accessibilityRole="checkbox" accessibilityLabel={`Hole ${h}`} accessibilityState={{ checked: on }}
              onPress={() => setHoles(on ? holes.filter((x) => x !== h) : [...holes, h].sort((a, b) => a - b))} style={[styles.hole, on && styles.holeOn]}>
              <Text style={[styles.holeText, on && styles.holeTextOn]}>{h}</Text>
            </Pressable>;
          })}
        </View>
        <Text style={styles.label}>Why does it need correcting?</Text>
        <TextInput value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="e.g. I entered a 5 on 7, it was a 4" placeholderTextColor={colors.searchFaint} style={styles.input} accessibilityLabel="Reason" />
      </ScrollView>
      <View style={{ padding: gutter }}>
        <Pressable accessibilityRole="button" disabled={!ok || busy} onPress={async () => { setBusy(true); await onSend(holes, reason.trim()); setBusy(false); }} style={[styles.primary, (!ok || busy) && styles.dim]}>
          <Text style={styles.primaryText}>{busy ? "Sending…" : "Send request"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

function DecideSheet({ name, approve, onClose, onSend }: { name: string; approve: boolean; onClose: () => void; onSend: (note: string | null) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = approve || note.trim().length > 0;
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.page} edges={["bottom"]}>
      <View style={styles.top}><Text style={styles.pageTitle}>{approve ? "Approve" : "Deny"} {name}'s request</Text><SheetClose onPress={onClose} /></View>
      <View style={{ padding: gutter, gap: 12 }}>
        <Text style={styles.onDark}>{approve ? "Approving reopens only those holes of their card. Their attester enters them again before they resubmit." : "Their submitted card stays as it is. Say why."}</Text>
        <Text style={styles.label}>{approve ? "Note (optional)" : "Reason"}</Text>
        <TextInput value={note} onChangeText={setNote} multiline maxLength={500} style={styles.input} accessibilityLabel={approve ? "Note" : "Reason"} />
        <Pressable accessibilityRole="button" disabled={!ok || busy} onPress={async () => { setBusy(true); await onSend(note.trim() || null); setBusy(false); }} style={[styles.primary, (!ok || busy) && styles.dim]}>
          <Text style={styles.primaryText}>{busy ? "Saving…" : approve ? "Approve" : "Deny"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  box: { gap: 4, padding: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.sheetInk },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.sheetInk },
  strong: { fontFamily: fonts.semibold },
  good: { color: colors.money.up },
  bad: { color: colors.error },
  request: { gap: 4, paddingTop: 8 },
  row: { flexDirection: "row", gap: 10 },
  small: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.maroon700, justifyContent: "center" },
  smallText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.maroon700 },
  button: { minHeight: minTap, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.maroon700, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.maroon700 },
  page: { flex: 1, backgroundColor: colors.maroon900 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  pageTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  onDark: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.boardInk },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  holes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hole: { width: 48, height: 44, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  holeOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  holeText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  holeTextOn: { color: colors.maroon900 },
  input: { minHeight: 90, padding: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.inputOnMaroon, color: colors.cream, fontFamily: fonts.regular, fontSize: 15, textAlignVertical: "top" },
  primary: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.maroon900 },
  dim: { opacity: 0.4 },
});
