import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { teeTimeLabel } from "@/lib/platform/codeTournaments";
import type { MatchDraftRound } from "@/lib/platform/matchDraft";
import { mayActFor, type MatchSelectionResponse, type SelectionMember, type Side, type VisibleSpot } from "@/lib/platform/matchSelection";
import { Avatar } from "~/components/Avatar.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { useAppMatchSelection } from "~/lib/useAppMatchSelection.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000)); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return `${d ? `${d}d ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
};
type Target = { match: number; team: Side; slot: number };

/**
 * The Match Selection Room in the app (website TripMatchDraftRoom with a saved trip, project_specs.md Golf Trips part
 * 2e): the countdown / day and time, the VS board (one row per match, its tee time, Team A VS Team B), the round picker,
 * Submit (Response rounds) / Lock in (Ranks rounds), the organizer's Start now / Randomize / Reset / Confirm Selections,
 * and the Players pull-up for the box being filled. Every rule is the shared lib's; the server decides each action.
 */
export function TripSelectionRoom({ tripId, rounds, initialRound, onClose, onSettings, onGoToMatches }: {
  tripId: string; rounds: MatchDraftRound[]; initialRound: string | null; onClose: () => void; onSettings: () => void; onGoToMatches: (round: number) => void;
}) {
  const [roundKey, setRoundKey] = useState(initialRound ?? rounds[0]?.key ?? null);
  const live = useAppMatchSelection(tripId, roundKey);
  const data: MatchSelectionResponse | null = live.data;
  const [target, setTarget] = useState<Target | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<SelectionMember | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const source = rounds.find((r) => r.key === roundKey);
  const round = data?.round, viewer = data?.viewer;
  const label = (team: Side) => data?.teamNames[team] || `Team ${team ? "B" : "A"}`;
  const member = (id: string | null) => data?.members.find((m) => m.profileId === id);
  const spotAt = (match: number, team: Side, slot: number): VisibleSpot | undefined => data?.spots.find((s) => s.match === match && s.team === team && s.slot === slot);
  const teeFor = (match: number) => { const perGroup = Math.max(1, Math.floor(4 / (2 * (round?.perSide ?? 1)))); const time = source?.teeTimes?.[Math.floor(match / perGroup)]; return time ? teeTimeLabel(time) : "Tee time TBD"; };
  const locked = !!source?.locked && !data?.completed;
  const active = !!data?.started && !data.completed && !locked;
  const canTap = (match: number, team: Side, slot: number) => {
    if (!data || !round || !viewer || !active || live.busy || !mayActFor(viewer, team)) return false;
    if (spotAt(match, team, slot)?.submitted) return false;
    if (round.type === "Response") return data.turn?.match === match && data.turn.team === team;
    return round.type === "Ranks" && !data.locked[team];
  };
  const listTeam: Side = target?.team ?? viewer?.captainOf ?? data?.turn?.team ?? 0;
  const finalIds = new Set(data?.spots.filter((s) => s.submitted && s.profileId).map((s) => s.profileId!) ?? []);
  const placedIds = new Set(data?.spots.filter((s) => !s.submitted && s.profileId).map((s) => s.profileId!) ?? []);
  const listed = (data?.rosters[listTeam] ?? []).filter((id) => !finalIds.has(id)).map((id) => member(id)).filter((m): m is SelectionMember => !!m)
    .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  // After a placement, move to the next empty spot of the same group / team (or lower the list when there's none).
  const lastData = useRef(data);
  useEffect(() => {
    if (lastData.current === data) return;
    lastData.current = data;
    if (!target || !data?.round) return;
    if (!data.spots.some((s) => s.match === target.match && s.team === target.team && s.slot === target.slot)) return;
    const matches = data.round.type === "Response" ? [target.match] : Array.from({ length: data.round.matches }, (_, m) => m);
    let next: Target | null = null;
    for (const match of matches) for (let slot = 0; slot < data.round.perSide && !next; slot++)
      if (!data.spots.some((s) => s.match === match && s.team === target.team && s.slot === slot)) next = { match, team: target.team, slot };
    setTarget(next);
    if (!next) setExpanded(false);
  }, [data, target]);

  const turnLabel = data?.turn ? `${label(data.turn.team)} ${data.turn.opening ? "puts forward" : "responds"} · Match ${data.turn.match + 1}` : "";
  const remaining = data?.deadline ? Date.parse(data.deadline) - (now + live.clockOffset) : null;
  const scheduled = source?.date ? Date.parse(`${source.date}T${source.time || "00:00"}`) : NaN;
  const countdown = remaining !== null ? clock(remaining) : !data?.started && Number.isFinite(scheduled) ? clock(scheduled - now) : "--:--";
  const whenParts = source?.when?.includes(" @ ") ? [source.when.slice(0, source.when.indexOf(" @ ")), source.when.slice(source.when.indexOf(" @ ") + 3).replace(/^0/, "")] : [source?.when || "Time not set"];
  const status = live.message || (!rounds.length ? "No rounds use Match Draft yet. Choose Match Draft for a round in Settings → Match Selection."
    : locked ? "This round has been played — its matches are locked."
    : data?.confirmed ? "Matches Selected"
    : data?.completed ? (viewer?.isOrganizer ? "Review and confirm the selections." : "Waiting for Organizer")
    : !data ? "Loading match selection…"
    : !data.started ? (data.startError ?? (viewer?.isOrganizer ? "Tap Start now when everyone's ready." : Number.isFinite(scheduled) && now >= scheduled ? "Waiting To Start" : "Waiting to start."))
    : round?.type === "Response" ? (viewer && data.turn && mayActFor(viewer, data.turn.team) ? `Your turn: ${turnLabel}` : `${turnLabel} — you'll see it once it's submitted.`)
    : "Ranks: each captain ranks their team. You can't see the other team's ranks until both lock in.");
  const group = data?.turn ? data.spots.filter((s) => s.match === data.turn!.match && s.team === data.turn!.team) : [];
  const teamFull = (team: Side) => (data?.spots.filter((s) => s.team === team).length ?? 0) >= (round ? round.matches * round.perSide : Infinity);

  const box = (match: number, team: Side, slot: number) => {
    const spot = spotAt(match, team, slot);
    const who = spot?.profileId ? member(spot.profileId) : undefined;
    const tappable = canTap(match, team, slot);
    const isTarget = target?.match === match && target.team === team && target.slot === slot;
    const body = who ? <View style={{ flex: 1 }}><Text style={styles.boxName} numberOfLines={1}>{who.name}</Text><Text style={styles.small}>{spot?.submitted ? (who.handicap === undefined ? "Final" : `HCP ${who.handicap}`) : "Not submitted"}</Text></View>
      : spot?.hidden ? <Text style={styles.small}>{round?.type === "Ranks" ? "Ranked ✓" : "Picked ✓"}</Text>
      : <Text style={styles.empty}>{tappable ? "Tap to place" : "Open"}</Text>;
    return <Pressable key={slot} disabled={!tappable} accessibilityRole={tappable ? "button" : "text"}
      accessibilityLabel={`${label(team)} ${round?.type === "Ranks" ? "rank" : "match"} ${match + 1}${round && round.perSide > 1 ? `, player ${slot + 1}` : ""}: ${who ? who.name : tappable ? "tap to place" : "open"}`}
      onPress={() => { setTarget({ match, team, slot }); setExpanded(true); setSearch(""); }}
      style={[styles.box, !!spot && styles.boxFilled, tappable && styles.boxActive, isTarget && styles.boxTarget]}>{body}</Pressable>;
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.title} accessibilityRole="header">Selection Room</Text>
          <View style={styles.corner}>{!data?.started && whenParts.map((p) => <Text key={p} style={styles.cornerText}>{p}</Text>)}</View>
        </View>

        <View style={styles.controls} accessibilityLabel="Selection controls">
          {data?.confirmed ? <Pressable accessibilityRole="button" onPress={() => onGoToMatches(data.round.number)} style={styles.confirm}><Text style={styles.confirmText}>Go To Matches</Text></Pressable>
            : data?.completed && viewer?.isOrganizer ? <Pressable accessibilityRole="button" disabled={live.busy} onPress={() => void live.act({ action: "confirm" })} style={styles.confirm}><Text style={styles.confirmText}>Confirm Selections</Text></Pressable>
            : !data?.completed && <Text style={styles.timer} accessibilityRole="timer">{countdown}</Text>}
          <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
          {viewer?.isOrganizer && !data?.confirmed && <View style={styles.actions}>
            <Pressable accessibilityRole="link" onPress={onSettings}><Text style={styles.link}>Edit golf setup</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={live.busy || (!!data?.startError && !data?.started)}
              onPress={() => data?.started ? Alert.alert("Reset this round's selection?", "Every placement for this round is cleared.", [
                { text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: async () => { if (await live.act({ action: "reset" })) { setTarget(null); setExpanded(false); } } }])
                : void live.act({ action: round?.type === "Randomized" ? "randomize" : "start" })}>
              <Text style={[styles.link, !!data?.startError && !data?.started && styles.dim]}>{data?.started ? "Reset" : round?.type === "Randomized" ? "Randomize" : "Start now"}</Text>
            </Pressable>
          </View>}
        </View>

        {rounds.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: gutter, paddingBottom: 8 }} accessibilityLabel="Match selection round">
          {rounds.map((r) => <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: r.key === roundKey }} onPress={() => { setRoundKey(r.key); setTarget(null); setExpanded(false); }}
            style={[styles.roundPill, r.key === roundKey && styles.roundOn]}><Text style={[styles.roundText, r.key === roundKey && styles.roundTextOn]}>Round {r.number}</Text></Pressable>)}
        </ScrollView>}
        {source && <Text style={styles.roundInfo}>{source.course} · {source.format}</Text>}

        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 300, gap: 10 }} accessibilityLabel="Match selection board">
          <View style={styles.vsHead}><Text style={styles.teamName}>{label(0)}{round?.type === "Ranks" && data?.locked[0] ? " · locked ✓" : ""}</Text><Text style={[styles.teamName, { textAlign: "right" }]}>{label(1)}{round?.type === "Ranks" && data?.locked[1] ? " · locked ✓" : ""}</Text></View>
          {round && Array.from({ length: round.matches }, (_, match) => <View key={match} style={[styles.vsRow, data?.turn?.match === match && styles.vsTurn]}>
            <View style={styles.vsMatchHead}><Text style={styles.vsLabel}>{round.type === "Ranks" ? "Rank" : "Match"} {match + 1}</Text><Text style={styles.small}>{teeFor(match)}</Text></View>
            <View style={styles.vsLine}>
              <View style={styles.vsSide}>{Array.from({ length: round.perSide }, (_, slot) => box(match, 0, slot))}</View>
              <Text style={styles.vs}>VS</Text>
              <View style={styles.vsSide}>{Array.from({ length: round.perSide }, (_, slot) => box(match, 1, slot))}</View>
            </View>
          </View>)}
          {active && round?.type === "Response" && data?.turn && viewer && mayActFor(viewer, data.turn.team) &&
            <Pressable accessibilityRole="button" disabled={live.busy || group.length < round.perSide} onPress={() => { setTarget(null); setExpanded(false); void live.act({ action: "submit" }); }}
              style={[styles.confirm, { alignSelf: "center" }, (live.busy || group.length < round.perSide) && styles.dim]}><Text style={styles.confirmText}>{round.perSide === 1 ? "Submit single" : "Submit pairing"}</Text></Pressable>}
          {active && round?.type === "Ranks" && viewer && ([0, 1] as const).filter((team) => mayActFor(viewer, team) && !data?.locked[team]).map((team) =>
            <Pressable key={team} accessibilityRole="button" disabled={live.busy || !teamFull(team)} onPress={() => { setTarget(null); setExpanded(false); void live.act({ action: "lock", team }); }}
              style={[styles.confirm, { alignSelf: "center" }, (live.busy || !teamFull(team)) && styles.dim]}><Text style={styles.confirmText}>Lock in {viewer.isOrganizer ? label(team) : "ranks"}</Text></Pressable>)}
        </ScrollView>

        <View style={[styles.sheet, { height: expanded ? "70%" : "30%" }]} accessibilityLabel="Match selection players">
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.handle}>
            <View style={styles.grabber} />
            <Text style={styles.handleText}>{target ? `${label(target.team)} · ${round?.type === "Ranks" ? "Rank" : "Match"} ${target.match + 1}` : `${label(listTeam)} players`} <Text style={styles.small}>{listed.length} available</Text></Text>
          </Pressable>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search players" placeholderTextColor={colors.searchFaint} style={styles.search} accessibilityLabel="Search match selection players" />
          {target && spotAt(target.match, target.team, target.slot)?.profileId && <Pressable accessibilityRole="button" disabled={live.busy} onPress={() => void live.act({ action: "remove", ...target })}><Text style={styles.link}>Clear this spot</Text></Pressable>}
          <Text style={styles.listHead}>{target ? "TAP PLACE TO PUT A PLAYER HERE" : "TAP A GLOWING BOX TO PLACE A PLAYER"}</Text>
          <ScrollView>
            {listed.map((m) => <View key={m.profileId} style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${m.name}'s profile`} onPress={() => setProfile(m)} style={styles.who}>
                <Avatar name={m.name} photoUrl={m.avatarUrl} size={34} />
                <Text style={styles.rowName} numberOfLines={1}>{m.name}{placedIds.has(m.profileId) ? <Text style={styles.small}> · placed</Text> : null}</Text>
              </Pressable>
              <Text style={styles.small}>HCP {m.handicap ?? "—"}</Text>
              <View style={{ width: 70, alignItems: "flex-end" }}>
                {target && canTap(target.match, target.team, target.slot) && <Pressable accessibilityRole="button" disabled={live.busy} accessibilityLabel={`Place ${m.name}`}
                  onPress={async () => { if (await live.act({ action: "place", ...target, player: m.profileId })) setSearch(""); }} style={styles.pick}><Text style={styles.pickText}>Place</Text></Pressable>}
              </View>
            </View>)}
            {data && !listed.length && <Text style={styles.status}>{search ? "No players match your search." : "Everyone on this team is placed."}</Text>}
          </ScrollView>
        </View>

        {profile && <Modal visible transparent animationType="fade" onRequestClose={() => setProfile(null)}>
          <Pressable style={styles.overlay} onPress={() => setProfile(null)}>
            <View style={styles.profile}>
              <View style={{ alignSelf: "flex-end" }}><SheetClose onPress={() => setProfile(null)} /></View>
              <Avatar name={profile.name} photoUrl={profile.avatarUrl} size={64} />
              <Text style={styles.teamName}>{profile.name}</Text>
              {profile.username && <Text style={styles.small}>@{profile.username}</Text>}
              <Text style={styles.small}>HCP {profile.handicap ?? "—"}</Text>
            </View>
          </Pressable>
        </Modal>}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: gutter, minHeight: 52 },
  back: { width: minTap, height: minTap, justifyContent: "center" },
  backText: { fontFamily: fonts.regular, fontSize: 34, color: colors.cream, marginTop: -4 },
  title: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  corner: { width: 96, alignItems: "flex-end" },
  cornerText: { fontFamily: fonts.regular, fontSize: 11, color: colors.boardInk },
  controls: { alignItems: "center", gap: 6, paddingHorizontal: gutter, paddingBottom: 10 },
  timer: { fontFamily: fonts.bold, fontSize: 30, color: colors.goldBright, fontVariant: ["tabular-nums"] },
  status: { fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk, textAlign: "center" },
  actions: { flexDirection: "row", gap: 24 },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.boardLink, paddingVertical: 8 },
  dim: { opacity: 0.4 },
  confirm: { minHeight: 46, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.goldBright, justifyContent: "center" },
  confirmText: { fontFamily: fonts.bold, fontSize: 16, color: colors.maroon900 },
  roundPill: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, justifyContent: "center" },
  roundOn: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  roundText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk },
  roundTextOn: { color: colors.maroon900 },
  roundInfo: { textAlign: "center", fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk, paddingBottom: 8 },
  vsHead: { flexDirection: "row", justifyContent: "space-between" },
  teamName: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  vsRow: { padding: 10, gap: 6, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  vsTurn: { borderColor: colors.goldBright },
  vsMatchHead: { alignItems: "center" },
  vsLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.boardGold },
  vsLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  vsSide: { flex: 1, gap: 6 },
  vs: { fontFamily: fonts.bold, fontSize: 13, color: colors.boardGold },
  box: { minHeight: 48, justifyContent: "center", paddingHorizontal: 10, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  boxFilled: { backgroundColor: colors.boardTop },
  boxActive: { borderColor: colors.goldBright },
  boxTarget: { borderWidth: 2 },
  boxName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  small: { fontFamily: fonts.regular, fontSize: 12, color: colors.boardInk },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: "rgba(255,255,255,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, backgroundColor: colors.boardTop, borderTopWidth: 1, borderColor: colors.boardBorder, paddingHorizontal: gutter, paddingBottom: 24 },
  handle: { alignItems: "center", paddingVertical: 8, gap: 6 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.boardBorder },
  handleText: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  search: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.control, backgroundColor: colors.searchField, color: colors.searchInk, fontFamily: fonts.regular, fontSize: 15 },
  listHead: { marginTop: 10, marginBottom: 4, fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  rowName: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  pick: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.goldBright, justifyContent: "center" },
  pickText: { fontFamily: fonts.bold, fontSize: 14, color: colors.maroon900 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: gutter },
  profile: { alignItems: "center", gap: 10, padding: 18, borderRadius: radius.card, backgroundColor: colors.maroon900, borderWidth: 1, borderColor: colors.boardBorder },
});
