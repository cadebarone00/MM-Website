import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { countdownParts } from "@/lib/platform/momNotifications";
import type { DraftCountdown, HomeDrafts } from "@/lib/platform/tripHomeDrafts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const zoneName = () => { try { return new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? ""; } catch { return ""; } };

/**
 * Trip Home → Drafts (project_specs.md Golf Trips part 2c): the Team Draft and Match Selection cards from the shared
 * lib/platform/tripHomeDrafts.ts. The Draft / Selection rooms open Golf Trips part 2e; organizer links open Settings (2g).
 */
export function TripHomeDrafts({ drafts, hasTeams, isOrganizer, onSettings, onRoom }: {
  drafts: HomeDrafts; hasTeams: boolean; isOrganizer: boolean; onSettings: () => void; onRoom: (which: "draft" | "selection" | "robin") => void;
}) {
  const { team, match } = drafts;
  return (
    <View accessibilityLabel="Drafts">
      {team && <Block title="Team Draft">
        {team.kind === "board"
          ? <DraftStrip countdown={team.countdown} canSchedule={isOrganizer} onSettings={onSettings} room="Draft Room" onRoom={() => onRoom("draft")} />
          : <Status text={team.text} action={isOrganizer ? team.action : undefined} onPress={onSettings} />}
      </Block>}
      {match && <Block title="Match Selection">
        {match.noRounds && <Status text="Add match-play rounds to set up match selection." action={isOrganizer ? "Set up rounds" : undefined} onPress={onSettings} />}
        {match.robin && (match.robin.ready
          ? <View style={styles.card}>
              <Text style={styles.heading}>Round robin</Text>
              {match.robin.sides.map((side) => <Text key={side.name} style={styles.line}>{side.name}</Text>)}
              <Text style={styles.muted}>{match.robin.courses.join(" · ")}</Text>
              <Room label={isOrganizer ? "Enter results" : "View results"} onPress={() => onRoom("robin")} />
            </View>
          : <Status text={match.robin.message} action={isOrganizer ? "Set up players" : undefined} onPress={onSettings} />)}
        {match.next && <DraftStrip heading={`Round ${match.next.round} @ ${match.next.course}`} format={match.next.format} countdown={match.next.countdown}
          selected={match.next.selected} blocked={match.next.blocked} canSchedule={isOrganizer} onSettings={onSettings} room="Selection Room" onRoom={() => onRoom("selection")} />}
        {match.status && <Status text={match.status.text} action={isOrganizer ? "Match settings" : undefined} onPress={onSettings} />}
      </Block>}
      {drafts.noDrafts && !hasTeams && <Block title="Drafts"><Text style={styles.muted}>No drafts coming up</Text></Block>}
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.block}><Text style={styles.blockTitle} accessibilityRole="header">{title}</Text><View style={{ gap: 10, marginTop: 10 }}>{children}</View></View>;
}

function Status({ text, action, onPress }: { text: string; action?: string; onPress: () => void }) {
  return (
    <View style={[styles.card, styles.statusRow]}>
      <Text style={[styles.line, { flex: 1 }]}>{text}</Text>
      {action && <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}><Text style={styles.actionText}>{action}</Text></Pressable>}
    </View>
  );
}

function Room({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.room, disabled && { opacity: 0.45 }]}>
      <Text style={styles.roomText}>{label}</Text>
    </Pressable>
  );
}

/** A draft's date, a Days · Hrs · Mins · Secs countdown (00 once it's time: "Waiting To Start" in the room), and the room buttons. */
function DraftStrip({ heading, format, countdown, selected = false, blocked = null, canSchedule, onSettings, room, onRoom }: {
  heading?: string; format?: string; countdown: DraftCountdown; selected?: boolean; blocked?: string | null;
  canSchedule: boolean; onSettings: () => void; room: "Draft Room" | "Selection Room"; onRoom: () => void;
}) {
  const [now, setNow] = useState(() => localStamp(new Date()));
  useEffect(() => { const t = setInterval(() => setNow(localStamp(new Date())), 1000); return () => clearInterval(t); }, []);
  const [zone] = useState(zoneName);
  const reached = !!(countdown.scheduled && countdown.target && now >= countdown.target);
  const parts = reached ? { days: 0, hours: 0, minutes: 0, seconds: 0 } : countdown.scheduled && countdown.target ? countdownParts(countdown.target, now) : null;
  const units = [["Days", parts?.days], ["Hrs", parts?.hours], ["Mins", parts?.minutes], ["Secs", parts?.seconds]] as const;
  return (
    <View style={styles.card}>
      {heading && <Text style={styles.heading}>{heading}</Text>}
      {heading && !!format && <Text style={styles.muted}>{format}</Text>}
      {!countdown.scheduled && canSchedule
        ? <Pressable accessibilityRole="button" accessibilityLabel={heading ? "Set match selection date and time" : "Set team draft date and time"} onPress={onSettings} style={styles.action}><Text style={styles.actionText}>No Date Set</Text></Pressable>
        : <Text style={styles.when} accessibilityLiveRegion="polite">{countdown.scheduled && countdown.when ? `${countdown.when}${zone ? ` ${zone}` : ""}` : "No Date Set"}</Text>}
      {selected ? <Text style={styles.when}>Matches Selected</Text> : (
        <View style={styles.countdown} accessibilityRole="timer" accessibilityLabel={parts ? `${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until the draft` : "Countdown to the draft"}>
          {units.map(([label, value], i) => <View key={label} style={styles.unitWrap}>
            {i > 0 && <Text style={styles.colon}>:</Text>}
            <View style={styles.unit}><Text style={styles.digits}>{value === undefined ? "--" : pad(value)}</Text><Text style={styles.unitLabel}>{label}</Text></View>
          </View>)}
        </View>
      )}
      {!!blocked && <Text style={styles.muted} accessibilityLiveRegion="polite">{blocked}</Text>}
      <View style={styles.rooms}>
        <Room label="Mock Draft" onPress={() => {}} disabled />
        <Room label={room} onPress={onRoom} disabled={!!blocked} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: gutter, marginTop: 28 },
  blockTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  card: { padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorder, backgroundColor: colors.boardTop, gap: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heading: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  line: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  when: { fontFamily: fonts.semibold, fontSize: 15, color: colors.avatarGold },
  action: { minHeight: minTap, justifyContent: "center", paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorder, alignSelf: "flex-start" },
  actionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardLink },
  countdown: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginVertical: 4 },
  unitWrap: { flexDirection: "row", alignItems: "center" },
  colon: { fontFamily: fonts.bold, fontSize: 22, color: colors.boardGold, marginHorizontal: 4, marginBottom: 14 },
  unit: { alignItems: "center", minWidth: 50 },
  digits: { fontFamily: fonts.bold, fontSize: 26, color: colors.cream, fontVariant: ["tabular-nums"] },
  unitLabel: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 0.8, color: colors.boardGold, textTransform: "uppercase" },
  rooms: { flexDirection: "row", gap: 10, marginTop: 4 },
  room: { flex: 1, minHeight: minTap, borderRadius: radius.control, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  roomText: { fontFamily: fonts.bold, fontSize: 14, color: colors.maroon900 },
});
