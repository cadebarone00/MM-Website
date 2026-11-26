import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { halves, type BigBoardScore } from "@/lib/platform/bigBoard";
import type { HomeCompetitionSummary } from "@/lib/platform/homeCompetition";
import { sortHomeRoster, type HomeRosterPlayer, type HomeRosterTeam } from "@/lib/platform/homeRoster";
import { countdownParts, countdownTarget, momNotes, nextRoundReminder, pickLine } from "@/lib/platform/momNotifications";
import { shortPlace } from "@/lib/platform/placeLabel";
import { shownUsername } from "@/lib/platform/playerUsername";
import type { HomeSlide, TripHomeView } from "@/lib/platform/tripHome";
import type { MomentumEvent } from "@/lib/platform/tripPush";
import { Avatar } from "~/components/Avatar.tsx";
import { shareUrl } from "~/lib/api.ts";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";
import type { InviteLinkState } from "~/lib/tripPage.ts";
import { TripHomeDrafts } from "./TripHomeDrafts.tsx";

/**
 * Trip Home (project_specs.md Golf Trips part 2c), drawn from the shared lib/platform/tripHome.ts view: the maroon head
 * (Your trip to … + dates, the Big Board), Balata Live, Players / Teams with the invite link, Competition.
 */
export function TripHome({ view, invite, onOpenItinerary, onOpenFlights, onSettings, onRoom, onOpenLive }: {
  view: TripHomeView; invite: { state: InviteLinkState; fresh: () => Promise<{ url: string } | null> };
  onOpenItinerary: () => void; onOpenFlights: () => void; onSettings: () => void; onRoom: (which: "draft" | "selection" | "robin") => void;
  /** Balata Live → View: the trip's live board in the app (the Golf tab), not the website. */
  onOpenLive: () => void;
}) {
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.label} accessibilityRole="header">
          {view.destination ? "Your trip to" : "Your trip"}
        </Text>
        {view.destination && <Text style={[styles.label, styles.destination]} numberOfLines={1}>{shortPlace(view.destination)}</Text>}
        {!!view.dateRange && <Text style={styles.dates}>{view.dateRange}</Text>}
      </View>
      <BigBoard score={view.score} highlights={view.highlights} mom={view.mom} slides={view.slides}
        onOpen={(slide) => slide.opens === "flights" ? onOpenFlights() : onOpenItinerary()} />
      <LiveCard path={view.livePath} tripName={view.tripName} onView={onOpenLive} />
      {view.drafts && <TripHomeDrafts drafts={view.drafts} hasTeams={!!view.roster.teams} isOrganizer={view.isOrganizer} onSettings={onSettings} onRoom={onRoom} />}
      <Roster players={view.roster.players} teams={view.roster.teams} allotted={view.roster.allotted}
        invite={view.roster.showInvite ? <InviteBox state={invite.state} fresh={invite.fresh} /> : null} />
      <Section title="Competition">
        {view.competition ? <CompetitionCard summary={view.competition} /> : <Text style={styles.muted}>{view.competitionNote}</Text>}
      </Section>
    </View>
  );
}

// ——— Big Board ———

const BOARD_TOP = 112;
const BOARD_BOTTOM = 96;

/** One gold-outlined box: scores (or Momentum / the Mom section) on top, upcoming plans one at a time below. Same height always. */
function BigBoard({ score, highlights, mom, slides, onOpen }: {
  score: BigBoardScore | null; highlights: MomentumEvent[]; mom: TripHomeView["mom"]; slides: HomeSlide[]; onOpen: (slide: HomeSlide) => void;
}) {
  const { width } = useWindowDimensions();
  const pageWidth = width - gutter * 2 - 2;
  const track = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const listKey = slides.map((s) => s.key).join("|");
  const [shown, setShown] = useState({ listKey, index: 0 });
  const index = shown.listKey === listKey ? Math.min(shown.index, slides.length - 1) : 0;
  // A new list of plans starts back at the first one.
  useEffect(() => { track.current?.scrollTo({ x: 0, animated: false }); }, [listKey]);
  const goTo = (target: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, target));
    track.current?.scrollTo({ x: next * pageWidth, animated: true });
    setShown({ listKey, index: next });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setShown({ listKey, index: Math.round(e.nativeEvent.contentOffset.x / pageWidth) });
  return (
    <View style={styles.boardWrap}>
      <View style={styles.board} accessibilityLabel="Big Board">
        <View style={styles.boardTop}>{score ? <ScoreTop score={score} highlights={highlights} /> : highlights.length ? <Highlights events={highlights} /> : <MomSection {...mom} />}</View>
        <View style={styles.divider} />
        <View style={styles.boardBottom}>
          <ScrollView ref={track} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} accessibilityLabel="Upcoming">
            {slides.map((slide, position) => (
              <Pressable key={slide.key} style={[styles.slide, { width: pageWidth }]} accessibilityRole="button" accessibilityLabel={slide.ariaLabel}
                accessibilityElementsHidden={position !== index} onPress={() => onOpen(slide)}>
                <View style={styles.slideHead}>
                  <SymbolView name={slideIcon(slide)} size={13} tintColor={colors.boardGold} />
                  <Text style={styles.slideKind}>{slide.kind}</Text>
                  {slide.status && <Text style={[styles.slideStatus, slide.live && styles.slideLive]}>{slide.status}</Text>}
                </View>
                <Text style={styles.slideWhen} numberOfLines={1}>{slide.when}</Text>
                {!!slide.detail && <Text style={styles.slideDetail} numberOfLines={1}>{slide.detail}</Text>}
                <Text style={styles.slideTitle} numberOfLines={1}>{slide.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Arrow side="left" disabled={index === 0} onPress={() => goTo(index - 1)} />
          <Arrow side="right" disabled={index >= slides.length - 1} onPress={() => goTo(index + 1)} />
        </View>
      </View>
      {/* One dot per plan; the row keeps its height even with one plan. */}
      <View style={styles.dots} accessibilityRole="tablist">
        {slides.map((slide, position) => (
          <Pressable key={slide.key} accessibilityRole="tab" accessibilityState={{ selected: position === index }} accessibilityLabel={`Plan ${position + 1}: ${slide.title}`}
            hitSlop={8} onPress={() => goTo(position)} style={[styles.dot, position === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const ICONS: Partial<Record<string, SFSymbol>> = { flights: "airplane", itinerary: "calendar", teeTime: "flag.fill", flight: "airplane", dinner: "fork.knife",
  lodging: "bed.double.fill", transportation: "car.fill", ride: "car.fill", activity: "star.fill" };
const slideIcon = (slide: HomeSlide): SFSymbol => slide.live ? "flag.fill" : ICONS[slide.icon] ?? "calendar";

function Arrow({ side, disabled, onPress }: { side: "left" | "right"; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={side === "left" ? "Previous plan" : "Next plan"} disabled={disabled} onPress={onPress}
      style={[styles.arrow, side === "left" ? { left: 0 } : { right: 0 }, disabled && { opacity: 0.3 }]}>
      <SymbolView name={side === "left" ? "chevron.left" : "chevron.right"} size={16} tintColor={colors.boardGold} />
    </Pressable>
  );
}

/** The newest highlights, one at a time (every 10 seconds). */
function useHighlight(events: MomentumEvent[]) {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (events.length < 2) return;
    const timer = setInterval(() => setTurn((t) => t + 1), 10_000);
    return () => clearInterval(timer);
  }, [events.length]);
  const shown = events.slice(0, 5);
  return shown.length ? shown[turn % shown.length] : null;
}

function Highlights({ events }: { events: MomentumEvent[] }) {
  const highlight = useHighlight(events);
  if (!highlight) return null;
  return <View style={styles.center} accessibilityLiveRegion="polite">
    <Text style={styles.momLine}><Text style={styles.bold}>{highlight.title}</Text> {highlight.detail}</Text>
  </View>;
}

/** Scores: team points with TO WIN between them, the leader, or (Team & Individual) both side by side. */
function ScoreTop({ score, highlights }: { score: BigBoardScore; highlights: MomentumEvent[] }) {
  const highlight = useHighlight(highlights);
  const line = <Text style={styles.scoreLine} numberOfLines={2}>{highlight ? <><Text style={styles.bold}>{highlight.title}</Text> {highlight.detail}</> : score.line}</Text>;
  if (score.kind === "both") return (
    <View style={styles.split}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.splitRow}><Text style={styles.teamName} numberOfLines={1}>{score.left.name}</Text><Text style={styles.splitPoints}>{halves(score.left.points)}</Text></View>
        <View style={styles.splitRow}><Text style={styles.teamName} numberOfLines={1}>{score.right.name}</Text><Text style={styles.splitPoints}>{halves(score.right.points)}</Text></View>
        <Text style={styles.toWinSmall}>TO WIN {halves(score.toWin)}</Text>
        {line}
      </View>
      <View style={styles.splitLine} />
      <View style={{ flex: 1, gap: 3 }} accessibilityLabel="Top standings including you">
        {score.top.map((p) => <View key={p.name} style={styles.splitRow}>
          <Text style={styles.topPlace}>{p.position}</Text><Text style={[styles.topName]} numberOfLines={1}>{p.name}</Text><Text style={styles.topTotal}>{p.total}</Text>
        </View>)}
      </View>
    </View>
  );
  return (
    <View style={styles.center}>
      {score.kind === "team" ? (
        <View style={styles.teams}>
          <View style={styles.team}><Text style={styles.teamName} numberOfLines={1}>{score.left.name}</Text><Text style={styles.points}>{halves(score.left.points)}</Text></View>
          <View style={styles.toWin}><Text style={styles.toWinLabel}>TO WIN</Text><Text style={styles.toWinValue}>{halves(score.toWin)}</Text></View>
          <View style={styles.team}><Text style={styles.teamName} numberOfLines={1}>{score.right.name}</Text><Text style={styles.points}>{halves(score.right.points)}</Text></View>
        </View>
      ) : (
        <View style={styles.leader}>
          <Text style={styles.toWinLabel}>LEADER</Text>
          <Text style={styles.leaderName} numberOfLines={1}>{score.leader}</Text>
          <Text style={styles.points}>{score.total} <Text style={styles.thru}>{score.thru}</Text></Text>
        </View>
      )}
      {line}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** The Mom section: my live notes (rotating every 10 s), else a countdown to arrival, else the next-round reminder, else nothing. */
function MomSection({ travel, arrivalDay, plans, rounds, afterRound }: TripHomeView["mom"]) {
  const [now, setNow] = useState(() => localStamp(new Date()));
  useEffect(() => { const timer = setInterval(() => setNow(localStamp(new Date())), 1000); return () => clearInterval(timer); }, []);
  const notes = travel ? momNotes(travel, now.slice(0, 16)) : [];
  if (notes.length) {
    const turn = Math.floor(Date.parse(`${now}Z`) / 10_000);
    const note = notes[turn % notes.length];
    return <View style={styles.center} accessibilityLiveRegion="polite">
      <Text style={styles.momLine}>{pickLine(note, turn)}</Text>
      {note.action && <Pressable accessibilityRole="link" onPress={() => { Linking.openURL(note.action!.url).catch(() => {}); }} style={styles.momAction}><Text style={styles.momActionText}>{note.action.label}</Text></Pressable>}
    </View>;
  }
  const target = countdownTarget(arrivalDay, plans);
  const parts = target ? countdownParts(target, now) : null;
  if (!parts) {
    const myTeeTimes = travel ? travel.items.filter((item) => item.kind === "teeTime" && travel.participants.some((p) => p.itemId === item.id && p.memberId === travel.meId && p.status === "going")).map((item) => item.startsAt) : [];
    const reminder = nextRoundReminder(rounds, now.slice(0, 10), afterRound, myTeeTimes);
    if (!reminder) return null;
    return <View style={styles.center}><Text style={styles.momLine}>{reminder.line}</Text>{!!reminder.sub && <Text style={styles.momSub}>{reminder.sub}</Text>}</View>;
  }
  const units = [["Days", parts.days], ["Hrs", parts.hours], ["Min", parts.minutes], ["Sec", parts.seconds]] as const;
  return (
    <View style={[styles.center, styles.countdown]} accessibilityRole="timer" accessibilityLabel={`${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until the trip`}>
      {units.map(([label, value]) => <View key={label} style={styles.unit}>
        <Text style={styles.tile}>{pad(value)}</Text><Text style={styles.unitLabel}>{label}</Text>
      </View>)}
    </View>
  );
}

// ——— Balata Live ———

function LiveCard({ path, tripName, onView }: { path: string | null; tripName: string; onView: () => void }) {
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const url = path ? shareUrl(path) : null;
  const copy = async () => {
    if (!url) return;
    try { await Clipboard.setStringAsync(url); setCopied(true); setNote("Balata Live link copied"); }
    catch { setNote("Couldn't copy. Open Balata Live link and copy its address."); }
  };
  return (
    <View style={styles.liveCard} accessibilityLabel="Balata Live invite">
      <View style={styles.liveTop}>
        <Text style={styles.liveTitle}>Balata Live</Text>
        {/* View stays in the app: the live leaderboard, matches and stats are the Golf tab. Copy / Share send the web link for people without the app. */}
        <Pressable accessibilityRole="button" accessibilityLabel="View Balata Live" onPress={onView}>
          <Text style={styles.liveView}>View</Text>
        </Pressable>
      </View>
      <Text style={styles.liveText}>Invite your peers to follow along.</Text>
      <View style={styles.inviteRow}>
        <Text style={styles.inviteLink} numberOfLines={1} selectable>{path ?? "Balata Live link unavailable"}</Text>
        <CopyButton label={copied ? "Copied" : "Copy link"} icon={copied ? "checkmark" : "doc.on.doc"} disabled={!url} onPress={() => void copy()} />
        <CopyButton icon="square.and.arrow.up" accessibilityLabel="Share Balata Live link" disabled={!url}
          onPress={() => { if (url) Share.share({ message: `Follow ${tripName} on Balata Live: ${url}` }).catch(() => setNote("Couldn't share. Use Copy link.")); }} />
      </View>
      {!!note && <Text style={styles.srNote} accessibilityLiveRegion="polite">{note}</Text>}
    </View>
  );
}

function CopyButton({ label, icon, disabled, onPress, accessibilityLabel }: { label?: string; icon: SFSymbol; disabled?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.copy, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
      <SymbolView name={icon} size={14} tintColor={colors.maroon900} />
      {label && <Text style={styles.copyText}>{label}</Text>}
    </Pressable>
  );
}

// ——— Players / Teams + invite link ———

function InviteBox({ state, fresh }: { state: InviteLinkState; fresh: () => Promise<{ url: string } | null> }) {
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  const text = state.status === "ok" ? state.link.url : state.status === "loading" ? "Getting your link…" : state.status === "off" ? "Invite links aren't switched on yet" : state.message;
  const copy = async () => {
    const link = await fresh();
    if (!link) return;
    try { await Clipboard.setStringAsync(link.url); setCopied("copied"); } catch { setCopied("failed"); }
    setTimeout(() => setCopied(""), 2500);
  };
  return (
    <View style={[styles.inviteRow, styles.inviteBox]} accessibilityLabel="Invite players">
      <Text style={styles.inviteLink} numberOfLines={1} selectable>{text}</Text>
      <CopyButton label={copied === "copied" ? "Copied" : copied === "failed" ? "Hold link to copy" : "Copy link"} icon={copied === "copied" ? "checkmark" : "doc.on.doc"}
        disabled={state.status !== "ok"} onPress={() => void copy()} />
    </View>
  );
}

function PlayerRow({ player, index }: { player: HomeRosterPlayer; index: number }) {
  return (
    <View style={styles.player}>
      <Text style={styles.playerNumber}>{index + 1}</Text>
      <Avatar name={player.name} photoUrl={player.avatarUrl} size={26} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.playerUsername} numberOfLines={1}>{shownUsername(player.name, player.username)}</Text>
      </View>
    </View>
  );
}

function Roster({ players, teams, allotted, invite }: { players: HomeRosterPlayer[]; teams: HomeRosterTeam[] | null; allotted: number | null; invite: React.ReactNode }) {
  if (teams) return (
    <Section title="Teams">
      {invite}
      {teams.map((team, i) => <View key={i} style={{ marginTop: 12 }} accessibilityLabel={team.name}>
        <Text style={styles.teamLabel}>{team.name}</Text>
        {team.players.map((p, n) => <PlayerRow key={p.name} player={p} index={n} />)}
      </View>)}
    </Section>
  );
  const sorted = sortHomeRoster(players);
  return (
    <Section title="Players" right={<Text style={styles.count} accessibilityLabel={allotted ? `${players.length} of ${allotted} players joined` : `${players.length} players joined`}>
      {allotted ? `${players.length}/${allotted}` : players.length}</Text>}>
      {invite}
      {sorted.length ? <View style={{ marginTop: 10 }}>{sorted.map((p, n) => <PlayerRow key={p.name} player={p} index={n} />)}</View>
        : <Text style={styles.muted}>Players show up here as they join the trip.</Text>}
    </Section>
  );
}

// ——— Competition ———

function CompetitionCard({ summary }: { summary: HomeCompetitionSummary }) {
  const facts: [string, string][] = [
    ["Type", summary.type],
    ...(summary.teamFormat ? [["Team format", summary.teamFormat], [summary.teamFormat === "2 Teams" ? "Your team" : "Teammates", summary.yourTeam || "Not on a team yet"]] as [string, string][] : []),
    ...(summary.individualFormat ? [["Individual", summary.individualFormat]] as [string, string][] : []),
    ["Days", String(summary.days)],
    ["Rounds", String(summary.rounds.length)],
    ...(summary.recordStandings ? [["Round robin standings", "W-L-T / winning percentage"]] as [string, string][] : []),
  ];
  return (
    <View style={styles.compCard} accessibilityLabel="Competition details">
      {facts.map(([label, value]) => <View key={label} style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>)}
      {summary.rounds.length > 0 && <>
        <View style={styles.compDivider} />
        <Text style={styles.subhead}>Formats</Text>
        {summary.rounds.map((round) => <View key={round.number} style={styles.fact}>
          <Text style={styles.factLabel}>Round {round.number}</Text>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={[styles.factValue, round.format === "Format not set" && styles.unset]}>{round.format}</Text>
            <Text style={[styles.roundCourse, round.course === "Course TBD" && styles.unset]}>{round.course}</Text>
          </View>
        </View>)}
      </>}
      {summary.totalPoints !== null && summary.toWin !== null && <>
        <View style={styles.compDivider} />
        <View style={styles.pointsRow}>
          <View style={{ alignItems: "center" }}><Text style={styles.toWinLabel}>TOTAL POINTS</Text><Text style={styles.pointsBig}>{halves(summary.totalPoints)}</Text></View>
          <View style={{ alignItems: "center" }}><Text style={styles.toWinLabel}>TO WIN</Text><Text style={[styles.pointsBig, { color: colors.goldBright }]}>{halves(summary.toWin)}</Text></View>
        </View>
      </>}
    </View>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTop}><Text style={styles.heading} accessibilityRole="header">{title}</Text>{right}</View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: gutter, paddingTop: 8 },
  label: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 31, color: colors.cream },
  destination: {},
  dates: { marginTop: 8, fontFamily: fonts.semibold, fontSize: 15, color: colors.avatarGold },
  boardWrap: { paddingHorizontal: gutter, marginTop: 16 },
  board: { borderWidth: 1, borderColor: colors.boardBorder, borderRadius: radius.card, backgroundColor: colors.boardTop, overflow: "hidden" },
  boardTop: { height: BOARD_TOP, paddingHorizontal: 14, justifyContent: "center" },
  divider: { height: 1, backgroundColor: colors.boardBorderSoft, marginHorizontal: 14 },
  boardBottom: { height: BOARD_BOTTOM, backgroundColor: colors.boardBottom },
  slide: { paddingHorizontal: minTap, paddingVertical: 10, justifyContent: "center" },
  slideHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  slideKind: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.boardGold },
  slideStatus: { fontFamily: fonts.capsBold, fontSize: 11, letterSpacing: 0.8, color: colors.boardGold },
  slideLive: { color: colors.errorOnMaroon },
  slideWhen: { marginTop: 4, fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  slideDetail: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  slideTitle: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12, color: colors.boardInk, textAlign: "center" },
  arrow: { position: "absolute", top: 0, bottom: 0, width: minTap, alignItems: "center", justifyContent: "center" },
  dots: { height: 22, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.boardBorderSoft },
  dotOn: { backgroundColor: colors.goldBright },
  center: { alignItems: "center", justifyContent: "center" },
  bold: { fontFamily: fonts.bold },
  momLine: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, color: colors.cream, textAlign: "center" },
  momSub: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk, textAlign: "center" },
  momAction: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder },
  momActionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardLink },
  countdown: { flexDirection: "row", gap: 10 },
  unit: { alignItems: "center", gap: 4 },
  tile: { minWidth: 48, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.maroon950, borderWidth: 1, borderColor: colors.boardBorderSoft, fontFamily: fonts.bold, fontSize: 26, color: colors.cream, textAlign: "center", fontVariant: ["tabular-nums"] },
  unitLabel: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 0.8, color: colors.boardGold, textTransform: "uppercase" },
  scoreLine: { marginTop: 6, fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk, textAlign: "center" },
  teams: { flexDirection: "row", alignItems: "center", gap: 10 },
  team: { flex: 1, alignItems: "center" },
  teamName: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  points: { fontFamily: fonts.bold, fontSize: 30, color: colors.cream, fontVariant: ["tabular-nums"] },
  toWin: { alignItems: "center" },
  toWinLabel: { fontFamily: fonts.capsBold, fontSize: 10, letterSpacing: 0.8, color: colors.boardGold },
  toWinValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.goldBright },
  toWinSmall: { fontFamily: fonts.capsBold, fontSize: 10, letterSpacing: 0.8, color: colors.boardGold },
  leader: { alignItems: "center" },
  leaderName: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  thru: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  split: { flexDirection: "row", gap: 10, alignItems: "center" },
  splitRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  splitPoints: { marginLeft: "auto", fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  splitLine: { width: 1, alignSelf: "stretch", backgroundColor: colors.boardBorderSoft },
  topPlace: { width: 22, fontFamily: fonts.bold, fontSize: 12, color: colors.boardGold },
  topName: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.cream },
  topTotal: { fontFamily: fonts.bold, fontSize: 13, color: colors.cream },
  liveCard: { marginTop: 18, marginHorizontal: gutter, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.avatarRing, backgroundColor: colors.inviteFill },
  liveTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  liveTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  liveView: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardLink, padding: 6 },
  liveText: { marginTop: 2, fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk },
  inviteRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  inviteBox: { padding: 8, paddingLeft: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colors.avatarRing, backgroundColor: colors.inputOnMaroon },
  inviteLink: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  copy: { height: 34, paddingHorizontal: 12, borderRadius: 9, backgroundColor: colors.cream, flexDirection: "row", alignItems: "center", gap: 6 },
  copyText: { fontFamily: fonts.bold, fontSize: 13, color: colors.maroon900 },
  srNote: { marginTop: 6, fontFamily: fonts.regular, fontSize: 12, color: colors.boardInk },
  section: { paddingHorizontal: gutter, marginTop: 28 },
  sectionTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  heading: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  count: { fontFamily: fonts.bold, fontSize: 14, color: colors.avatarGold, fontVariant: ["tabular-nums"] },
  muted: { marginTop: 8, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  teamLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.avatarGold },
  player: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  playerNumber: { width: 18, fontFamily: fonts.bold, fontSize: 13, color: colors.avatarGold, fontVariant: ["tabular-nums"] },
  playerName: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  playerUsername: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(255,255,255,0.6)" },
  compCard: { marginTop: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorder, backgroundColor: colors.boardTop, gap: 8 },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  factLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk },
  factValue: { flexShrink: 1, textAlign: "right", fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  roundCourse: { fontFamily: fonts.regular, fontSize: 12, color: colors.boardInk, textAlign: "right" },
  unset: { opacity: 0.55 },
  compDivider: { height: 1, backgroundColor: colors.boardBorderSoft, marginVertical: 4 },
  subhead: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  pointsRow: { flexDirection: "row", justifyContent: "space-around" },
  pointsBig: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream },
});
