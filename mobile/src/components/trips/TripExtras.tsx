import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { coachStops } from "@/lib/platform/coachMarks";
import { TIPS_SEEN_KEY, hasSeen, markSeen } from "@/lib/platform/tripTour";
import { RATING_MAX } from "@/lib/platform/venuePlaces";
import { apiRaw } from "~/lib/api.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/** The phone's own storage, in the shape the shared seen-flags use (website: localStorage). */
const store = { getItem: (key: string) => { try { return SecureStore.getItem(key); } catch { return null; } },
  setItem: (key: string, value: string) => { try { SecureStore.setItem(key, value); } catch { /* the in-memory copy covers this session */ } } };

/** First-visit tips on the trip page: once per account (website TripTips + CoachMarks), 600 ms after it settles. */
export function TripTips({ profileId, isOrganizer }: { profileId: string; isOrganizer: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const stops = useMemo(() => coachStops(isOrganizer), [isOrganizer]);
  useEffect(() => {
    if (hasSeen(TIPS_SEEN_KEY, profileId, store)) return;
    const timer = setTimeout(() => setStep(0), 600);
    return () => clearTimeout(timer);
  }, [profileId]);
  if (step === null) return null;
  const done = () => { markSeen(TIPS_SEEN_KEY, profileId, store); setStep(null); };
  const last = step >= stops.length - 1;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={done}>
      <View style={styles.dim}>
        <View style={styles.tip} accessibilityViewIsModal>
          <Text style={styles.tipCount}>{step + 1} of {stops.length}</Text>
          <Text style={styles.tipText}>{stops[step].text}</Text>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={done} style={styles.ghost}><Text style={styles.ghostText}>Skip</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => last ? done() : setStep(step + 1)} style={styles.primary}><Text style={styles.primaryText}>{last ? "Done" : "Next"}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type Visit = { placeId: string; name: string; when: string; visitedOn: string };
const NOT_NOW_KEY = (tripId: string) => `maroon_rate_not_now_${tripId}`;
const today = () => new Date().toLocaleDateString("en-CA");

/**
 * "How was yesterday?" (website RatePlacesPrompt, Venue places phase 4): my recent plans at places, rate 1–10 (tap again to
 * clear) or Skip (never asked again). Submit saves; Not now closes it until tomorrow on this phone. Asks nothing when
 * ratings aren't switched on, offline, or everything's already rated.
 */
export function RatePlaces({ tripId, visits }: { tripId: string; visits: Visit[] }) {
  const [open, setOpen] = useState<Visit[] | null>(null);
  const key = visits.map((v) => v.placeId).join(",");
  useEffect(() => {
    if (!visits.length || store.getItem(NOT_NOW_KEY(tripId)) === today()) return;
    let current = true;
    void apiRaw<{ done?: string[] }>(`/api/golf-trips/${encodeURIComponent(tripId)}/ratings`).then(({ status, body }) => {
      if (!current || status < 200 || status >= 300 || !body) return;
      const left = visits.filter((v) => !(body.done ?? []).includes(v.placeId));
      if (left.length) setOpen(left);
    });
    return () => { current = false; };
  }, [tripId, key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` stands for `visits`
  if (!open) return null;
  return <PromptSheet visits={open} onClose={(notNow) => { if (notNow) store.setItem(NOT_NOW_KEY(tripId), today()); setOpen(null); }}
    onSubmit={async (ratings, skips) => {
      const { status } = await apiRaw(`/api/golf-trips/${encodeURIComponent(tripId)}/ratings`, { method: "POST",
        body: { ratings: open.filter((v) => ratings[v.placeId]).map((v) => ({ placeId: v.placeId, rating: ratings[v.placeId], visitedOn: v.visitedOn })), skips } });
      return status >= 200 && status < 300;
    }} />;
}

function PromptSheet({ visits, onSubmit, onClose }: { visits: Visit[]; onSubmit: (ratings: Record<string, number>, skips: string[]) => Promise<boolean>; onClose: (notNow: boolean) => void }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rated = Object.keys(ratings).length;
  const rate = (id: string, value: number) => setRatings((all) => { const next = { ...all }; if (next[id] === value) delete next[id]; else next[id] = value; return next; });
  const skip = (id: string) => { setSkipped((list) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id]); setRatings((all) => { const next = { ...all }; delete next[id]; return next; }); };
  const submit = async () => { setBusy(true); setError(null); if (await onSubmit(ratings, skipped)) setDone(true); else setError("Couldn't save your ratings. Try again."); setBusy(false); };
  const label = busy ? "Saving…" : rated ? `Submit ${rated} ${rated === 1 ? "rating" : "ratings"}` : skipped.length ? "Done" : "Rate or skip a place";
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onClose(true)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityLabel="Rate yesterday's places">
          {done ? <View style={{ gap: 6, alignItems: "center", paddingVertical: 16 }}>
            <Text style={styles.title}>Thanks!</Text>
            <Text style={styles.body}>Your ratings help the next Maroon trip find the best spots.</Text>
            <Pressable accessibilityRole="button" onPress={() => onClose(false)} style={[styles.primary, { alignSelf: "stretch" }]}><Text style={styles.primaryText}>Close</Text></Pressable>
          </View> : <>
            <Text style={styles.title} accessibilityRole="header">How was yesterday?</Text>
            <Text style={styles.body}>Rate the places you went, 1 to 10, or skip any you'd rather not.</Text>
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 12, paddingVertical: 8 }}>
              {visits.map((v) => {
                const isSkipped = skipped.includes(v.placeId);
                return <View key={v.placeId} style={[styles.place, isSkipped && { opacity: 0.6 }]}>
                  <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.placeName}>{v.name}</Text><Text style={styles.small}>{v.when}</Text></View>
                    <Pressable accessibilityRole="button" onPress={() => skip(v.placeId)} style={styles.skip}><Text style={styles.skipText}>{isSkipped ? "Undo" : "Skip"}</Text></Pressable></View>
                  {isSkipped ? <Text style={styles.small}>Skipped. We won't ask about this one again.</Text>
                    : <View style={styles.scale} accessibilityLabel={`Rate ${v.name}`}>{Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) =>
                      <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} out of ${RATING_MAX}`} accessibilityState={{ selected: ratings[v.placeId] === n }}
                        onPress={() => rate(v.placeId, n)} style={[styles.score, ratings[v.placeId] === n && styles.scoreOn]}>
                        <Text style={[styles.scoreText, ratings[v.placeId] === n && styles.scoreTextOn]}>{n}</Text></Pressable>)}</View>}
                </View>;
              })}
            </ScrollView>
            {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
            <View style={styles.row}>
              <Pressable accessibilityRole="button" onPress={() => onClose(true)} style={styles.ghost}><Text style={styles.ghostText}>Not now</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy || (!rated && !skipped.length)} onPress={() => void submit()} style={[styles.primary, (busy || (!rated && !skipped.length)) && { opacity: 0.45 }]}>
                <Text style={styles.primaryText}>{label}</Text></Pressable>
            </View>
          </>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: colors.sheetBackdrop, justifyContent: "center", padding: gutter },
  tip: { borderRadius: radius.card, backgroundColor: colors.cream, padding: 18, gap: 10 },
  tipCount: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.8, color: colors.inkMuted, textTransform: "uppercase" },
  tipText: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23, color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  ghost: { flex: 1, minHeight: minTap, borderRadius: radius.control, borderWidth: 1, borderColor: colors.maroon700, alignItems: "center", justifyContent: "center" },
  ghostText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.maroon700 },
  primary: { flex: 1, minHeight: minTap, borderRadius: radius.control, backgroundColor: colors.maroon700, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  backdrop: { flex: 1, backgroundColor: colors.sheetBackdrop, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.sheetTop, padding: gutter, paddingBottom: 34, gap: 8 },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.sheetInk },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.sheetMuted },
  place: { gap: 8, padding: 12, borderRadius: radius.control, backgroundColor: colors.sheetGlass, borderWidth: 1, borderColor: colors.sheetLineSoft },
  placeName: { fontFamily: fonts.bold, fontSize: 16, color: colors.sheetInk },
  small: { fontFamily: fonts.regular, fontSize: 13, color: colors.sheetMuted },
  skip: { minHeight: minTap, justifyContent: "center", paddingHorizontal: 8 },
  skipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.maroon700 },
  scale: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  score: { width: 30, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.sheetLine, alignItems: "center", justifyContent: "center" },
  scoreOn: { backgroundColor: colors.maroon700, borderColor: colors.maroon700 },
  scoreText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.sheetInk },
  scoreTextOn: { color: colors.cream },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.error },
});
