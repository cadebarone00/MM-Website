import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts, Spectral_500Medium_Italic } from "@expo-google-fonts/spectral";
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
import { FadeLine, GoldBox } from "./GoldBox.tsx";

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

const BOARD_TOP = 92;
const BOARD_BOTTOM = 110;

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
      <GoldBox accessibilityLabel="Big Board">
        <View style={styles.boardTop}>{score ? <ScoreTop score={score} highlights={highlights} /> : highlights.length ? <Highlights events={highlights} /> : <MomSection {...mom} />}</View>
        <FadeLine style={styles.divider} />
        <View style={styles.boardBottom}>
          <ScrollView ref={track} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} accessibilityLabel="Upcoming">
            {slides.map((slide, position) => (
              <Pressable key={slide.key} style={{ width: pageWidth }} accessibilityRole="button" accessibilityLabel={slide.ariaLabel}
                accessibilityElementsHidden={position !== index} onPress={() => onOpen(slide)}>
                {/* The plan: kind + status, when, details; then its title centered on the arrow row. */}
                <View style={styles.slide}>
                  <View style={styles.slideHead}>
                    <View style={styles.slideKindRow}>
                      <SymbolView name={slideIcon(slide)} size={14} tintColor={colors.tripLabel} />
                      <Text style={styles.slideKind} numberOfLines={1}>{slide.kind}</Text>
                    </View>
                    {slide.status && <Text style={[styles.slideStatus, slide.live && styles.slideLive]}>{slide.status}</Text>}
                  </View>
                  <Text style={styles.slideWhen} numberOfLines={1}>{slide.when}</Text>
                  {!!slide.detail && <Text style={styles.slideDetail} numberOfLines={1}>{slide.detail}</Text>}
                </View>
                <Text style={styles.slideTitle} numberOfLines={1}>{slide.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Arrow side="left" disabled={index === 0} onPress={() => goTo(index - 1)} />
          <Arrow side="right" disabled={index >= slides.length - 1} onPress={() => goTo(index + 1)} />
        </View>
      </GoldBox>
      {/* One dot per plan (the current one long and gold); the row keeps its height even with one plan. */}
      <View style={styles.dots} accessibilityRole="tablist">
        {slides.map((slide, position) => (
          <Pressable key={slide.key} accessibilityRole="tab" accessibilityState={{ selected: position === index }} accessibilityLabel={`Plan ${position + 1}: ${slide.title}`}
            hitSlop={8} onPress={() => goTo(position)} style={[styles.dot, position === index && slides.length > 1 && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

// Outline icons, like TestFlight (the live round keeps a filled flag).
const ICONS: Partial<Record<string, SFSymbol>> = { flights: "airplane", itinerary: "calendar", teeTime: "flag", flight: "airplane", dinner: "fork.knife",
  lodging: "bed.double", transportation: "car", ride: "car", activity: "star" };
const slideIcon = (slide: HomeSlide): SFSymbol => slide.live ? "flag.fill" : ICONS[slide.icon] ?? "calendar";

function Arrow({ side, disabled, onPress }: { side: "left" | "right"; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={side === "left" ? "Previous plan" : "Next plan"} disabled={disabled} onPress={onPress} hitSlop={6}
      style={[styles.arrow, side === "left" ? { left: 6 } : { right: 6 }, disabled && { opacity: 0.3 }]}>
      <SymbolView name={side === "left" ? "chevron.left" : "chevron.right"} size={15} weight="semibold" tintColor={colors.tripGold} />
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
  // Labels above four flip-clock tiles (cream numbers split across the middle), in the middle 70% of the board.
  return (
    <View style={styles.countdown} accessibilityRole="timer" accessibilityLabel={`${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes until the trip`}>
      {units.map(([label, value]) => <View key={label} style={styles.unit}>
        <Text style={styles.unitLabel}>{label}</Text>
        <View style={styles.tile}>
          <LinearGradient colors={[colors.tripTileTop, colors.tripTileMid, colors.tripTileLow, colors.tripTileMid]} locations={[0, 0.5, 0.5, 1]} style={StyleSheet.absoluteFill} />
          <Text style={styles.tileText}>{pad(value)}</Text>
          <View style={styles.tileSplit} />
        </View>
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
        <Pressable accessibilityRole="button" accessibilityLabel="View Balata Live" onPress={onView} hitSlop={6} style={({ pressed }) => [styles.livePill, pressed && { opacity: 0.8 }]}>
          <Text style={styles.liveView}>View</Text>
        </Pressable>
      </View>
      <Text style={styles.liveText}>Invite your peers to follow along.</Text>
      <View style={[styles.inviteRow, styles.inviteBox]}>
        <Text style={styles.inviteLink} numberOfLines={1} selectable>{path ?? "Balata Live link unavailable"}</Text>
        <CopyButton label={copied ? "Copied" : "Copy link"} icon={copied ? "checkmark" : "doc.on.doc"} disabled={!url} onPress={() => void copy()} />
        <CopyButton icon="point.3.connected.trianglepath.dotted" accessibilityLabel="Share Balata Live link" disabled={!url}
          onPress={() => { if (url) Share.share({ message: `Follow ${tripName} on Balata Live: ${url}` }).catch(() => setNote("Couldn't share. Use Copy link.")); }} />
      </View>
      {!!note && <Text style={styles.srNote} accessibilityLiveRegion="polite">{note}</Text>}
    </View>
  );
}

function CopyButton({ label, icon, disabled, onPress, accessibilityLabel }: { label?: string; icon: SFSymbol; disabled?: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.copy, !label && styles.copySquare, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
      <SymbolView name={icon} size={15} tintColor={colors.maroon900} />
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
  // TestFlight look: no box; small letter-spaced caps labels, values on the right, fading lines, two points tiles.
  const [italicReady] = useFonts({ Spectral_500Medium_Italic });
  const italic = italicReady ? { fontFamily: fonts.italic } : null;
  return (
    <View style={styles.compCard} accessibilityLabel="Competition details">
      {facts.map(([label, value]) => <View key={label} style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue} numberOfLines={1}>{value}</Text></View>)}
      {summary.rounds.length > 0 && <>
        <FadeLine style={styles.compDivider} />
        <Text style={styles.subhead}>Formats</Text>
        {summary.rounds.map((round) => <View key={round.number} style={styles.round}>
          <Text style={styles.factLabel}>Round {round.number}</Text>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={[styles.roundFormat, round.format === "Format not set" && [styles.unsetFormat, italic]]} numberOfLines={1}>{round.format}</Text>
            <Text style={[styles.roundCourse, round.course === "Course TBD" && italic]} numberOfLines={1}>{round.course}</Text>
          </View>
        </View>)}
      </>}
      {summary.totalPoints !== null && summary.toWin !== null && <>
        <FadeLine style={styles.compDivider} />
        <View style={styles.pointsRow}>
          <View style={styles.pointsCell}><Text style={styles.factLabel}>Total points</Text><Text style={styles.pointsBig}>{halves(summary.totalPoints)}</Text></View>
          <View style={styles.pointsCell}><Text style={styles.factLabel}>To win</Text><Text style={[styles.pointsBig, { color: colors.tripGold }]}>{halves(summary.toWin)}</Text></View>
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
  boardWrap: { paddingHorizontal: gutter, marginTop: 23 },
  boardTop: { height: BOARD_TOP, justifyContent: "center", overflow: "hidden" },
  divider: { marginHorizontal: 14 },
  boardBottom: { height: BOARD_BOTTOM },
  slide: { height: 74, paddingHorizontal: 14, justifyContent: "center", gap: 4 },
  slideHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  slideKind: { flexShrink: 1, fontFamily: fonts.capsBold, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", color: colors.tripLabel },
  slideStatus: { fontFamily: fonts.capsBold, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", color: colors.tripGold },
  slideLive: { color: colors.tripLive },
  slideWhen: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 19, color: colors.cream },
  slideDetail: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(251,248,241,0.65)" },
  slideTitle: { height: 36, paddingHorizontal: 48, paddingBottom: 4, textAlign: "center", textAlignVertical: "center", lineHeight: 32, fontFamily: fonts.bold, fontSize: 15, color: colors.tripInk },
  arrow: { position: "absolute", bottom: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.tripFillStrong, alignItems: "center", justifyContent: "center" },
  dots: { height: 16, marginTop: 8, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.tripDotOff },
  dotOn: { width: 18, backgroundColor: colors.tripGold },
  center: { alignItems: "center", justifyContent: "center" },
  bold: { fontFamily: fonts.bold },
  momLine: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, color: colors.cream, textAlign: "center" },
  momSub: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk, textAlign: "center" },
  momAction: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorder },
  momActionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardLink },
  countdown: { flexDirection: "row", gap: 8, width: "70%", alignSelf: "center" },
  unit: { flex: 1, alignItems: "center", gap: 5 },
  tile: { width: "100%", height: 44, borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  unitLabel: { fontFamily: fonts.capsBold, fontSize: 13, letterSpacing: 1.5, color: colors.avatarGold, textTransform: "uppercase" },
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
  liveCard: { marginTop: 6, marginBottom: 0, marginHorizontal: gutter, paddingVertical: 18, paddingHorizontal: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.tripLineFaint, backgroundColor: colors.maroon900 },
  liveTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  liveTitle: { fontFamily: fonts.semibold, fontSize: 22, color: colors.avatarGold },
  liveView: { fontFamily: fonts.capsSemibold, fontSize: 13, color: colors.avatarGold },
  liveText: { marginTop: 6, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.cream },
  inviteRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  inviteBox: { height: 42, paddingLeft: 12, paddingRight: 4, borderRadius: radius.control, borderWidth: 1, borderColor: "rgba(220,196,149,0.35)", backgroundColor: colors.tripFill },
  inviteLink: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 13, color: "rgba(251,248,241,0.8)" },
  copy: { height: 34, paddingHorizontal: 12, borderRadius: 9, backgroundColor: colors.cream, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
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
  compCard: { marginTop: 12, gap: 8 },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  factLabel: { fontFamily: fonts.capsBold, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: "uppercase", color: colors.tripLabel },
  factValue: { flexShrink: 1, textAlign: "right", fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.tripInk },
  roundCourse: { textAlign: "right", fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: "rgba(251,248,241,0.65)" },
  compDivider: { marginVertical: 4 },
  subhead: { fontFamily: fonts.capsBold, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: "uppercase", color: colors.tripGold },
  pointsRow: { flexDirection: "row", gap: 10 },
  pointsBig: { fontFamily: fonts.bold, fontSize: 30, color: colors.tripInk },
  slideKindRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  tileText: { fontFamily: fonts.bold, fontSize: 24, color: colors.cream, fontVariant: ["tabular-nums"] },
  tileSplit: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  livePill: { minHeight: 32, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.tripPillLine, backgroundColor: "rgba(220,196,149,0.08)", justifyContent: "center" },
  copySquare: { width: 40, paddingHorizontal: 0 },
  round: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  roundFormat: { textAlign: "right", fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.cream },
  unsetFormat: { color: "rgba(251,248,241,0.5)" },
  pointsCell: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 6, borderRadius: radius.control, backgroundColor: "rgba(251,248,241,0.06)" },
});
