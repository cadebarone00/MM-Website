import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { apiJson } from "~/lib/api.ts";
import { pushState, turnOnPush, type PushState } from "~/lib/push.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

type Item = { id: string; label: string; note: string | null; versions: number };
type Group = { title: string; items: Item[] };

/**
 * Building blocks → Notifications (dev only; owner request 2026-11-27): every notification type the app sends: the app's
 * own (grouped by their Settings switch) and every highlight trigger in the sheet. Tap one and a test of it comes to THIS
 * phone, with one of its wordings at random and sample names (GET / POST /api/app/push-test). Lock the phone to see it.
 */
export function NotificationTester() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; text: string } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setState(await pushState().catch(() => "off" as const));
    const r = await apiJson<{ groups?: Group[] }>("/api/app/push-test");
    if (r.ok && Array.isArray(r.body.groups)) { setGroups(r.body.groups); setOpen(new Set(r.body.groups.slice(0, 1).map((g) => g.title))); }
    else setError(r.ok ? "Couldn't load the notification types." : r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function send(item: Item) {
    setBusy(item.id); setError(null); setSent(null);
    const r = await apiJson<{ words?: { title: string; body: string } }>("/api/app/push-test", { method: "POST", body: { id: item.id } });
    setBusy(null);
    if (r.ok) setSent({ id: item.id, text: r.body.words ? `${r.body.words.title} · ${r.body.words.body}` : "Sent." });
    else setError(r.error);
  }
  const toggle = (title: string) => setOpen((now) => { const next = new Set(now); if (next.has(title)) next.delete(title); else next.add(title); return next; });

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>Tap a type to send yourself a test, with one of its wordings at random. Lock the phone to see it like a real one.</Text>
      {state && state !== "on" && (
        <Pressable accessibilityRole="button" onPress={() => void turnOnPush(true).then((a) => setState(a.state))} style={styles.warn}>
          <Text style={styles.warnText}>{state === "unsupported" ? "Notifications need a real iPhone." : state === "not_set_up" ? "Notifications aren't set up for this build." : "Phone notifications are off on this phone. Tap to turn them on."}</Text>
        </Pressable>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {!groups && !error && <ActivityIndicator color={colors.maroon700} />}
      {groups?.map((group) => (
        <View key={group.title} style={styles.group}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open.has(group.title) }} onPress={() => toggle(group.title)} style={styles.groupHead}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <Text style={styles.groupCount}>{`${group.items.length} ${open.has(group.title) ? "▴" : "▾"}`}</Text>
          </Pressable>
          {open.has(group.title) && group.items.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Send a test: ${item.label}`} disabled={!!busy} onPress={() => void send(item)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <View style={styles.itemText}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemNote} numberOfLines={2}>{[item.note, `${item.versions} wording${item.versions === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</Text>
                {sent?.id === item.id && <Text style={styles.sent}>{`Sent: ${sent.text}`}</Text>}
              </View>
              {busy === item.id ? <ActivityIndicator color={colors.maroon700} /> : <Text style={styles.send}>Send</Text>}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  intro: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  warn: { padding: 12, borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.gold },
  warnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.maroon700 },
  error: { fontFamily: fonts.semibold, fontSize: 14, color: colors.error },
  group: { borderRadius: radius.card, backgroundColor: colors.white, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  groupHead: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, backgroundColor: colors.paper },
  groupTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.maroon900 },
  groupCount: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkMuted },
  item: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pressed: { backgroundColor: colors.paper },
  itemText: { flex: 1, gap: 2 },
  itemLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  itemNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted },
  sent: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: colors.maroon700 },
  send: { fontFamily: fonts.bold, fontSize: 14, color: colors.maroon700 },
});
