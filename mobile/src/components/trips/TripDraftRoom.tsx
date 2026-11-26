import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { teamDraftSize, teamLetter } from "@/lib/platform/teamDraft";
import { teamDraftRoomState } from "@/lib/platform/teamDraftPicks";
import { Avatar } from "~/components/Avatar.tsx";
import { FullScreenPage } from "~/components/FullScreenPage.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { useAppTeamDraft } from "~/lib/useAppTeamDraft.ts";
import { clockText, useDraftClock } from "~/lib/useDraftClock.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/** The stats row under each player (website statCells); saved trips have none yet, so "—" like the website. */
const STAT_LABELS = ["HCP", "AVG", "ADJ", "PPG", "FWY%", "GIR%", "BPR"];

/**
 * The Team Draft room in the app (website TripDraftRoom with a saved trip, project_specs.md Golf Trips part 2e): the
 * countdown and day / time, the organizer's Start Draft Now / Reset / Confirm selections, team boxes two across (2 Teams =
 * two tall columns; Pairs / 3-Ball / 4-Ball = a box per team, captain in spot 1), and the Players pull-up with Draft. Every
 * rule comes from the shared lib (teamDraftRoomState / draftBoardFor); the server decides each pick and a drafted player
 * stays on that team for good.
 */
export function TripDraftRoom({ tripId, when, target, onClose, onSettings }: { tripId: string; when: string | null; target: string | null; onClose: () => void; onSettings: () => void }) {
  const draft = useAppTeamDraft(tripId, true);
  const room = teamDraftRoomState(draft.data);
  const clock = useDraftClock(target);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const data = draft.data, board = room.board;
  const members = useMemo(() => new Map((data?.members ?? []).map((m) => [m.profileId, m])), [data]);
  const size = teamDraftSize(data?.settings.teamType);
  const captainPicks = data?.settings.method === "Captain's Picks";
  const turn = board?.turn ?? null;
  const picking = !!board && room.started && captainPicks && turn !== null && room.canPick(turn) && !draft.busy;
  const done = !!board && captainPicks && board.done;
  const spots = size ?? Math.max(1, board?.capacity ?? 1, ...(board?.teams.map((t) => t.length) ?? [0]));
  const label = (team: number) => `Team ${teamLetter(team)}`;
  const available = (board?.available ?? []).map((id) => members.get(id)!).filter(Boolean).filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const status = draft.message || (done ? room.completed ? "Selections confirmed." : "All selections ready for confirmation."
    : room.started ? picking ? `${label(turn!)} picks next. Choose a player below.` : turn === null ? "" : `Waiting for ${label(turn)}'s captain.` : room.status);
  const whenParts = when?.includes(" @ ") ? [when.slice(0, when.indexOf(" @ ")), when.slice(when.indexOf(" @ ") + 3).replace(/^0/, "")] : when ? [when] : ["Date not set"];
  const shown = profile ? members.get(profile) : null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <FullScreenPage style={styles.page}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.title} accessibilityRole="header">Team Draft Room</Text>
          <View style={styles.corner}>{!room.started && !done && whenParts.map((p) => <Text key={p} style={styles.cornerText}>{p}</Text>)}</View>
        </View>

        <View style={styles.controls} accessibilityLabel="Team draft controls">
          {done && room.organizer && !room.completed
            ? <Pressable accessibilityRole="button" disabled={draft.busy} onPress={() => void draft.confirm()} style={styles.confirm}><Text style={styles.confirmText}>Confirm selections</Text></Pressable>
            : !room.started && !room.completed && <Text style={styles.timer} accessibilityRole="timer">{clockText(clock.parts)}</Text>}
          {!room.started && !room.completed && !room.organizer && clock.reached && <Text style={styles.status}>Waiting To Start</Text>}
          {!!status && <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>}
          {room.organizer && !room.completed && <View style={styles.actions}>
            <Pressable accessibilityRole="link" onPress={onSettings}><Text style={styles.link}>Edit golf setup</Text></Pressable>
            {room.started || done
              ? <Pressable accessibilityRole="button" disabled={draft.busy} onPress={() => Alert.alert("Reset the draft?", "Every pick is cleared and the draft starts again from the beginning.", [
                  { text: "Cancel", style: "cancel" }, { text: "Reset", style: "destructive", onPress: () => void draft.reset() }])}><Text style={styles.link}>Reset</Text></Pressable>
              : <Pressable accessibilityRole="button" disabled={draft.busy || !room.canStart || !captainPicks} onPress={() => void draft.start()}>
                  <Text style={[styles.link, (!room.canStart || !captainPicks) && styles.dim]}>Start Draft Now</Text></Pressable>}
          </View>}
        </View>

        <ScrollView contentContainerStyle={styles.grid} accessibilityLabel="Team draft board">
          {!data && <Text style={styles.status}>{draft.message || "Loading the draft…"}</Text>}
          {board?.teams.map((team, index) => <View key={index} style={[styles.team, picking && turn === index && styles.onClock]} accessibilityLabel={label(index)}>
            <View style={styles.teamHead}><Text style={styles.teamName}>{label(index)}</Text>{size ? <Text style={styles.small}>{team.length} / {size}</Text> : null}</View>
            {Array.from({ length: spots }, (_, spot) => {
              const member = team[spot] ? members.get(team[spot]) : null;
              const captain = spot === 0 && !!member && data?.captains[index] === member.profileId;
              return <View key={spot} style={[styles.slot, !!member && styles.slotFilled]}>
                <Text style={styles.spotNumber}>{spot + 1}</Text>
                {member ? <View style={{ flex: 1 }}><Text style={styles.slotName} numberOfLines={1}>{member.name}</Text><Text style={styles.small}>{captain ? "Captain" : "Team roster"}</Text></View>
                  : <Text style={styles.empty}>{spot === 0 && size ? "Captain spot" : "Open spot"}</Text>}
              </View>;
            })}
          </View>)}
        </ScrollView>

        {/* The Players pull-up: rests low with the list showing; tap its bar to raise it. */}
        <View style={[styles.sheet, { height: expanded ? "75%" : "38%" }]} accessibilityLabel="Draft players">
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.handle}>
            <View style={styles.grabber} />
            <Text style={styles.handleText}>Players <Text style={styles.small}>{board?.available.length ?? 0} available</Text></Text>
          </Pressable>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search players" placeholderTextColor={colors.searchFaint} style={styles.search} accessibilityLabel="Search draft players" />
          <Text style={styles.listHead}>{picking ? `${label(turn!).toUpperCase()} PICKS · PLAYER` : "PLAYER"}</Text>
          <ScrollView>
            {available.map((m) => <View key={m.profileId} style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${m.name}'s profile`} onPress={() => setProfile(m.profileId)} style={styles.who}>
                <Avatar name={m.name} photoUrl={m.avatarUrl} size={34} /><Text style={styles.rowName} numberOfLines={1}>{m.name}</Text>
              </Pressable>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }}>
                {STAT_LABELS.map((s) => <View key={s} style={{ alignItems: "center" }}><Text style={styles.statLabel}>{s}</Text><Text style={styles.statValue}>—</Text></View>)}
              </ScrollView>
              <View style={{ width: 70, alignItems: "flex-end" }}>
                {picking && <Pressable accessibilityRole="button" accessibilityLabel={`Draft ${m.name} to ${label(turn!)}`} onPress={() => void draft.pick(m.profileId)} style={styles.pick}><Text style={styles.pickText}>Draft</Text></Pressable>}
              </View>
            </View>)}
            {data && available.length === 0 && <Text style={styles.status}>{search ? "No players match your search." : "No available players."}</Text>}
          </ScrollView>
        </View>

        {shown && <Modal visible transparent animationType="fade" onRequestClose={() => setProfile(null)}>
          <Pressable style={styles.overlay} onPress={() => setProfile(null)}>
            <View style={styles.profile} onStartShouldSetResponder={() => true}>
              <View style={{ alignSelf: "flex-end" }}><SheetClose onPress={() => setProfile(null)} /></View>
              <Avatar name={shown.name} photoUrl={shown.avatarUrl} size={64} />
              <Text style={styles.teamName}>{shown.name}</Text>
              {shown.username && <Text style={styles.small}>@{shown.username}</Text>}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
                {STAT_LABELS.map((s) => <View key={s} style={{ alignItems: "center" }}><Text style={styles.statLabel}>{s}</Text><Text style={styles.statValue}>—</Text></View>)}
              </View>
            </View>
          </Pressable>
        </Modal>}
      </FullScreenPage>
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: gutter, paddingBottom: 280 },
  team: { width: "48%", flexGrow: 1, padding: 10, gap: 6, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  onClock: { borderColor: colors.goldBright },
  teamHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  teamName: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  small: { fontFamily: fonts.regular, fontSize: 12, color: colors.boardInk },
  slot: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 8, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  slotFilled: { backgroundColor: colors.boardTop },
  spotNumber: { width: 16, fontFamily: fonts.bold, fontSize: 12, color: colors.boardGold },
  slotName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: "rgba(255,255,255,0.4)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, backgroundColor: colors.boardTop, borderTopWidth: 1, borderColor: colors.boardBorder, paddingHorizontal: gutter, paddingBottom: 24 },
  handle: { alignItems: "center", paddingVertical: 8, gap: 6 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.boardBorder },
  handleText: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  search: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.control, backgroundColor: colors.searchField, color: colors.searchInk, fontFamily: fonts.regular, fontSize: 15 },
  listHead: { marginTop: 10, marginBottom: 4, fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  who: { flexDirection: "row", alignItems: "center", gap: 8, width: 130 },
  rowName: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  statLabel: { fontFamily: fonts.capsSemibold, fontSize: 10, color: colors.boardGold },
  statValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  pick: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.goldBright, justifyContent: "center" },
  pickText: { fontFamily: fonts.bold, fontSize: 14, color: colors.maroon900 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: gutter },
  profile: { alignItems: "center", gap: 10, padding: 18, borderRadius: radius.card, backgroundColor: colors.maroon900, borderWidth: 1, borderColor: colors.boardBorder },
});
