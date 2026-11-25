import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetClose } from "~/components/SheetClose.tsx";
import * as SecureStore from "expo-secure-store";
import { SymbolView } from "expo-symbols";
import { halves } from "@/lib/platform/bigBoard";
import { competitionMatchOffset } from "@/lib/platform/competitionMatchNumber";
import { courseOverviewName } from "@/lib/platform/courseShortName";
import { resolveGolfFormat } from "@/lib/platform/formats";
import { golfDayAssignment, golfDayDateLabel, golfDayMatchNames, golfDayRounds, golfDaySummary } from "@/lib/platform/golfDay";
import { rankLeaderboard } from "@/lib/platform/golfLeaderboardOrder";
import { pairingStatus, playerPoints, parColor, parLabel, roundDay, sideScore, teeSheet } from "@/lib/platform/golfTab";
import { plannedRounds, type GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { golfSections, type CompetitionStructure, type GolfTripSection } from "@/lib/platform/golfTripNavigation";
import { matchScoring, normalizeCompetitor, type GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { standingsFormat as describeStandingsFormat } from "@/lib/platform/historicalTripStandings";
import { withHoleStandings } from "@/lib/platform/matchCenter";
import { shownUsername } from "@/lib/platform/playerUsername";
import { teamPoints } from "@/lib/platform/teamPoints";
import { skinsCount } from "@/lib/platform/tripSkins";
import { Avatar } from "~/components/Avatar.tsx";
import { TripGames, type TripGamesContext } from "./TripGames.tsx";
import { TripMatchDetail } from "./TripMatchDetail.tsx";
import { TripPredict } from "./TripPredict.tsx";
import { TripStats } from "./TripStats.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

const COLLAPSED_KEY = "golfDayBoardCollapsed";
const readCollapsed = () => { try { return SecureStore.getItem(COLLAPSED_KEY) === "1"; } catch { return false; } };
const storeCollapsed = (value: boolean) => { try { SecureStore.setItem(COLLAPSED_KEY, value ? "1" : "0"); } catch { /* kept for this visit */ } };

type Slot = GolfTripSection | "Predict";

/**
 * The trip's Golf tab (project_specs.md Golf Trips part 2d, slice 1a): the golf-day board, the section pill (Board ·
 * Games · Stats · Predict), Team / Indi, round pills, the leaderboard or tee sheet, team points and the round's matches.
 * Everything is worked out by the website's shared lib/ code. Match details, player and team cards: slice 1b; Games,
 * Stats and Predict (Predict's wallet on the account): slice 2.
 */
export function TripGolf({ match: source, schedule, structure, viewerName, roundLive, playerStats, predict, games, notice }: {
  match: GolfMatchPreview; schedule: GolfTripDraft; structure: CompetitionStructure; viewerName: string | null; roundLive: boolean;
  playerStats: boolean; predict: { on: boolean; off: string[] }; games: TripGamesContext;
  /** Why today's scoring sheet isn't open yet (no confirmed pars, no attestee), or null. */
  notice?: string | null;
}) {
  const predictOn = predict.on;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => setCollapsed((value) => { storeCollapsed(!value); return !value; });
  const noComp = !structure.individual && !structure.team;
  const teamOnly = structure.team && !structure.individual;
  const both = structure.individual && structure.team;
  const sections = golfSections(structure, playerStats).filter((s) => !(teamOnly && s.id === "Overview")).map((s) => s.id === "Competition" ? { ...s, label: "Board" } : s);
  const slots: { id: Slot; label: string }[] = [...sections, ...(predictOn && !noComp ? [{ id: "Predict" as const, label: "Predict" }] : [])];
  const pillTabs = slots.filter(({ id }) => !(both && id === "Competition"));
  // Which section is open (Board / Games / Stats / Predict) and, on Board, which leaderboard (Team or Indi) are kept apart:
  // coming back to Board from another section always opens the team board when the trip has teams.
  const homeBoard: "Competition" | "Overview" = structure.team ? "Competition" : "Overview";
  const [area, setArea] = useState<"Board" | "Games" | "Stats" | "Predict">("Board");
  const [board, setBoard] = useState<"Competition" | "Overview">(homeBoard);
  const active: Slot = area === "Board" ? board : area;
  const boardActive = area === "Board";
  const openSection = (id: Slot) => {
    if (id === "Overview" || id === "Competition") { if (area !== "Board") setBoard(homeBoard); else if (!both) setBoard(id); setArea("Board"); }
    else setArea(id as "Games" | "Stats" | "Predict");
  };

  // Rounds: a pill per round; an earlier round shows its own saved standings and matches.
  const rounds = useMemo(() => plannedRounds(schedule), [schedule]);
  const [chosenRound, setChosenRound] = useState<number | null>(null);
  const selected = rounds.find((r) => r.number === chosenRound) ?? rounds.find((r) => r.number === source.round);
  const match = useMemo(() => {
    if (!selected || selected.number === source.round) return source;
    const snapshot = source.roundStandings?.find((row) => row.round === selected.number);
    return { ...source, round: selected.number, roundDate: selected.date, course: schedule[`round${selected.number}Course`] || "Course TBD",
      format: schedule[`round${selected.number}Format`] || "Format not set", formatDef: undefined,
      matches: source.matches.filter((p) => p.round === selected.number), leaderboard: snapshot?.leaderboard ?? [], par: snapshot?.par ?? source.par };
  }, [source, selected, schedule]);
  const { label: standingsLabel, sharedBall } = describeStandingsFormat(source.format);
  const standingsRound = source.roundStandings?.find((row) => row.round === source.round)?.standingsRound ?? source.round;
  const leaderboardMatch = sharedBall && standingsRound !== source.round
    ? { ...source, round: standingsRound, format: schedule[`round${standingsRound}Format`] ?? source.format, formatDef: undefined } : source;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <DayBoard match={source} schedule={schedule} structure={structure} viewerName={viewerName} collapsed={collapsed} />
      {notice && <View style={styles.notice} accessibilityRole="summary"><Text style={styles.noticeText}>{notice}</Text></View>}
      <View style={styles.navRow}>
        <View style={styles.pill} accessibilityRole="tablist" accessibilityLabel="Golf sections">
          {pillTabs.map(({ id, label }) => {
            const on = id === "Overview" || id === "Competition" ? boardActive : id === area;
            return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => openSection(id)} style={[styles.pillTab, on && styles.pillTabOn]}>
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={collapsed ? "Expand golf overview" : "Collapse golf overview"} accessibilityState={{ expanded: !collapsed }} onPress={toggle} style={styles.handle}>
          <View style={styles.handleBar} />
        </Pressable>
      </View>

      {both && boardActive && <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel="Leaderboard type">
        {(["Competition", "Overview"] as const).map((id) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: active === id }} onPress={() => setBoard(id)} style={[styles.switchTab, active === id && styles.switchOn]}>
          <Text style={[styles.switchText, active === id && styles.switchTextOn]}>{id === "Competition" ? "Team" : "Indi"}</Text></Pressable>)}
      </View>}

      {active === "Competition" && structure.team && <TeamSummary match={match} />}
      {active === "Competition" && rounds.length > 0 && <View style={styles.rounds}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: gutter }} accessibilityRole="tablist" accessibilityLabel="Rounds">
          {rounds.map((r) => <Pressable key={r.number} accessibilityRole="tab" accessibilityState={{ selected: r.number === match.round }} onPress={() => setChosenRound(r.number)}
            style={[styles.roundPill, r.number === match.round && styles.roundPillOn]}><Text style={[styles.roundText, r.number === match.round && styles.roundTextOn]}>Round {r.number}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.roundCourse}>{schedule[`round${match.round}Course`] || match.course || "Course TBD"}</Text>
        <Text style={styles.roundFormat}>{schedule[`round${match.round}Format`] || match.format || "Format not set"}</Text>
      </View>}

      {active === "Overview" && !noComp && !teamOnly && sharedBall && <View style={styles.notice} accessibilityRole="summary">
        <Text style={styles.noticeTitle}>Standings after Round {standingsRound}</Text>
        <Text style={styles.noticeText}>{standingsLabel} being played in Round {source.round}</Text>
      </View>}

      {active === "Overview" && (teamOnly ? <TeeSheet match={match} /> : <Leaderboard match={leaderboardMatch} byToday={noComp} />)}
      {active === "Competition" && <Matches full={source} match={match} roundStarted={roundLive && match.round === source.round} showStats={playerStats} />}
      {active === "Games" && <View style={styles.section}><TripGames match={source} saved={games}
        rounds={rounds.map((r) => ({ number: r.number, date: r.date, course: schedule[`round${r.number}Course`] || undefined }))} /></View>}
      {/* Live trips have no recorded-round stats yet (same as the website); imported trips bring theirs in part 2g. */}
      {active === "Stats" && <View style={styles.section}><TripStats stats={undefined} /></View>}
      {active === "Predict" && <View style={styles.section}><TripPredict tripId={games.tripId} match={source} structure={structure} off={predict.off} /></View>}
    </ScrollView>
  );
}

/** Your golf day: you (name, @username, TOT · POS · points earned), the round's date, then each round's tee time @ course and match. */
function DayBoard({ match, schedule, structure, viewerName, collapsed }: { match: GolfMatchPreview; schedule: GolfTripDraft; structure: CompetitionStructure; viewerName: string | null; collapsed: boolean }) {
  if (collapsed) return null;
  const rounds = golfDayRounds(match, schedule);
  const summary = golfDaySummary(match, viewerName, structure);
  const me = golfDayAssignment(match, viewerName).player;
  return (
    <View style={styles.day} accessibilityLabel="Your golf day">
      {(viewerName || summary) && <View style={styles.profile}>
        {viewerName && <View style={styles.identity}>
          <Avatar name={viewerName} photoUrl={me?.avatarUrl} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.name} numberOfLines={1}>{viewerName}</Text><Text style={styles.username} numberOfLines={1}>{shownUsername(viewerName, me?.username)}</Text></View>
        </View>}
        {summary && <View style={styles.summary} accessibilityLabel="Your trip standings">
          <Stat label="TOT" value={summary.total} />
          <Stat label="POS" value={summary.position.split("/")[0].trim().replace(/^T(?=\d)/, "")} />
          {structure.team && <Stat label="Pts Ern" value={summary.points == null ? "—" : String(summary.points)} />}
        </View>}
      </View>}
      <Text style={styles.date}>{golfDayDateLabel(match.roundDate)}</Text>
      {rounds.length ? rounds.map((round) => {
        const { player, ownSide } = golfDayAssignment(round, viewerName);
        const course = courseOverviewName(player?.course || ownSide?.course || round.course || "Course not set", round.course);
        const format = round.format || "Format not set";
        const matchup = golfDayMatchNames(round, viewerName);
        return <View key={round.round} accessibilityLabel={`Round ${round.round} overview`} style={{ marginTop: 6 }}>
          <Text style={styles.dayCourse}>{player?.teeTime || ownSide?.teeTime || "TBD"} @ {course}</Text>
          <Text style={styles.dayMatch}>{matchup === "No match assigned" ? `${format} · ${matchup}` : matchup}</Text>
        </View>;
      }) : <Text style={styles.muted}>Round not set</Text>}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={{ alignItems: "center", minWidth: 44 }}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

/** Individual leaderboard: POS · player · (HCP when net) · TOT / PTS · (SKINS) · THRU · TDY, best first; Gross / Net when both count. */
function Leaderboard({ match, byToday }: { match: GolfMatchPreview; byToday: boolean }) {
  const [net, setNet] = useState(false);
  const stableford = resolveGolfFormat(match.formatDef?.key ?? match.format).scoringMethod === "stableford";
  const scoring = matchScoring(match);
  const showNet = scoring === "Net" || (scoring === "Both" && net);
  const rows = rankLeaderboard(match.leaderboard, { net: showNet, stableford, today: byToday });
  const skins = skinsCount(match);
  const [picked, setPicked] = useState<string | null>(null);
  const card = rows.find((r) => r.golfer.name === picked);
  if (!rows.length) return <Empty text="Your leaderboard and round scores will show here" />;
  return (
    <View style={styles.board}>
      {scoring === "Both" && <View style={[styles.switch, { marginHorizontal: 0, alignSelf: "flex-end", width: 160 }]} accessibilityRole="radiogroup" accessibilityLabel="Scoring">
        {[false, true].map((value) => <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: net === value }} onPress={() => setNet(value)} style={[styles.switchTab, net === value && styles.switchOn]}>
          <Text style={[styles.switchText, net === value && styles.switchTextOn]}>{value ? "Net" : "Gross"}</Text></Pressable>)}
      </View>}
      {scoring === "Net" && <Text style={[styles.colLabel, { textAlign: "right" }]}>NET SCORING</Text>}
      <View style={[styles.row, styles.headRow]} accessibilityElementsHidden>
        <Text style={[styles.colLabel, styles.pos]}>POS</Text><Text style={[styles.colLabel, { flex: 1 }]}>PLAYER</Text>
        {showNet && <Text style={[styles.colLabel, styles.num]}>HCP</Text>}
        <Text style={[styles.colLabel, styles.num]}>{stableford ? "PTS" : "TOT"}</Text>
        {skins && <Text style={[styles.colLabel, styles.num]}>SKINS</Text>}
        <Text style={[styles.colLabel, styles.num]}>THRU</Text><Text style={[styles.colLabel, styles.num]}>TDY</Text>
      </View>
      {rows.map(({ position, golfer, total, thru, today, netTotal, netToday, pointsTotal, pointsToday }) => {
        const tot = stableford ? (pointsTotal !== undefined ? `${pointsTotal}` : total) : parLabel(showNet ? netTotal : total);
        const tdy = stableford ? (pointsToday !== undefined ? `${pointsToday}` : today) : parLabel(showNet ? netToday : today);
        return <View key={golfer.name} style={styles.row}>
          <Text style={[styles.rank, styles.pos]}>{position}</Text>
          <Pressable style={styles.player} accessibilityRole="button" accessibilityLabel={`${golfer.name} public trip profile`} onPress={() => setPicked(golfer.name)}>
            <Avatar name={golfer.name} photoUrl={golfer.avatarUrl} size={28} />
            <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.playerName} numberOfLines={1}>{golfer.name}</Text><Text style={styles.username} numberOfLines={1}>{shownUsername(golfer.name, golfer.username)}</Text></View>
          </Pressable>
          {showNet && <Text style={styles.num2} accessibilityLabel={`Handicap ${golfer.hcp}`}>{golfer.hcp}</Text>}
          <Text style={[styles.num2, scoreColor(stableford ? undefined : parColor(tot))]} accessibilityLabel={`Total ${tot}`}>{tot}</Text>
          {skins && <Text style={styles.num2}>{skins.has(golfer.name) ? skins.get(golfer.name) : "—"}</Text>}
          <Text style={styles.num2} accessibilityLabel={`Thru ${thru}`}>{thru}</Text>
          <Text style={[styles.num2, scoreColor(stableford ? undefined : parColor(tdy))]} accessibilityLabel={`Today ${tdy}`}>{tdy}</Text>
        </View>;
      })}
      {card && <PlayerCard name={card.golfer.name} avatarUrl={card.golfer.avatarUrl} username={card.golfer.username} round={match.round} course={match.course}
        position={card.position} total={stableford ? card.pointsTotal !== undefined ? `${card.pointsTotal} PTS` : card.total : parLabel(showNet ? card.netTotal : card.total)}
        thru={card.thru} par={match.par} holes={card.holes} onClose={() => setPicked(null)} />}
    </View>
  );
}

/** A player's public trip profile (website PlayerPublicTripProfile, core): who, where they stand, and this round's card. */
function PlayerCard({ name, avatarUrl, username, round, course, position, total, thru, par, holes, onClose }: {
  name: string; avatarUrl?: string | null; username?: string | null; round: number; course: string; position: string; total: string; thru: string;
  par: number[]; holes: (number | null)[]; onClose: () => void;
}) {
  const nine = (from: number) => <View style={{ flexDirection: "row" }}>
    {par.slice(from, from + 9).map((p, i) => {
      const strokes = holes[from + i];
      const diff = strokes == null ? null : strokes - p;
      return <View key={i} style={styles.cardCell}>
        <Text style={styles.cardHole}>{from + i + 1}</Text><Text style={styles.cardPar}>{p}</Text>
        <Text style={[styles.cardScore, diff !== null && diff < 0 && { color: colors.errorOnMaroon }, diff === 0 && { color: colors.goldBright }]}>{strokes ?? ""}</Text>
      </View>;
    })}
  </View>;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.maroon900 }} edges={["bottom"]}>
        <View style={[styles.navRow, { marginTop: 14, justifyContent: "flex-end" }]}><SheetClose onPress={onClose} /></View>
        <ScrollView contentContainerStyle={{ padding: gutter, gap: 16 }}>
          <View style={{ alignItems: "center", gap: 6 }}>
            <Avatar name={name} photoUrl={avatarUrl} size={72} />
            <Text style={styles.cardTitle}>{name}</Text><Text style={styles.username}>{shownUsername(name, username)}</Text>
          </View>
          <View style={[styles.summary, { justifyContent: "center", gap: 24 }]}><Stat label="POS" value={position} /><Stat label="TOT" value={total} /><Stat label="THRU" value={thru || "—"} /></View>
          <View style={styles.board}>
            <Text style={styles.cardTitle}>Round {round}</Text><Text style={styles.muted}>{course}</Text>
            {par.length ? <><View style={{ marginTop: 10 }}>{nine(0)}</View>{par.length > 9 && <View style={{ marginTop: 8 }}>{nine(9)}</View>}</>
              : <Text style={styles.muted}>No scorecard for this round yet.</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const scoreColor = (kind: ReturnType<typeof parColor>) => kind === "under" ? { color: colors.errorOnMaroon } : kind === "even" ? { color: colors.goldBright } : null;

/** Team only: the tee sheet — each tee time, its players with handicaps. */
function TeeSheet({ match }: { match: GolfMatchPreview }) {
  const times = teeSheet(match);
  return (
    <View style={styles.board}>
      <Text style={styles.cardTitle}>Tee Sheet</Text>
      <Text style={styles.muted}>{match.course} • {match.roundDate ? roundDay(match.roundDate) : "Date TBD"} • Round {match.round}</Text>
      {times.length ? times.map(([time, golfers]) => <View key={time} style={styles.teeRow}>
        <Text style={styles.teeTime}>{time}</Text>
        <View style={{ flex: 1 }}>{golfers.map((g) => <View key={g.name} style={styles.teePlayer}><Text style={styles.playerName}>{g.name}</Text><Text style={styles.username}>HCP {g.hcp}</Text></View>)}</View>
      </View>) : <Text style={styles.muted}>No one is playing this round yet.</Text>}
    </View>
  );
}

/** The two teams, their points (from the organizer's round settings) and TO WIN between them. */
function TeamSummary({ match }: { match: GolfMatchPreview }) {
  const [left, right] = match.sides;
  const team = teamPoints(match);
  // Tapping the box drops down every player's match points, best first.
  const [open, setOpen] = useState(false);
  const ranking = open ? playerPoints(withHoleStandings(match)) : [];
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="Points by player">
    <View style={styles.teamBox} accessibilityLabel="Tournament standings">
      <View style={styles.teamSide}><Text style={styles.teamName} numberOfLines={1}>{left.name}</Text><Text style={styles.teamScore}>{team ? halves(team.points[0]) : left.score || "—"}</Text></View>
      <View style={{ alignItems: "center" }} accessibilityLabel="Points to win"><Text style={styles.colLabel}>TO WIN</Text><Text style={styles.toWin}>{team ? halves(team.available / 2 + 0.5) : "—"}</Text></View>
      <View style={styles.teamSide}><Text style={styles.teamName} numberOfLines={1}>{right.name}</Text><Text style={styles.teamScore}>{team ? halves(team.points[1]) : right.score || "—"}</Text></View>
    </View>
    {open && <View style={[styles.board, { flexDirection: "row", gap: 12 }]}>
      {(["left", "right"] as const).map((side) => <View key={side} style={{ flex: 1 }} accessibilityLabel={`${side === "left" ? left.name : right.name} points by player`}>
        {ranking.filter((r) => r.side === side).map((r) => <View key={r.name} style={styles.teePlayer}><Text style={styles.playerName} numberOfLines={1}>{r.name}</Text><Text style={styles.statValue}>{halves(r.points)}</Text></View>)}
      </View>)}
    </View>}
    </Pressable>
  );
}

/** The round's matches: Match n, each side and its score, the status (tee time / THRU / final) in the middle. */
function Matches({ full, match, roundStarted, showStats }: { full: GolfMatchPreview; match: GolfMatchPreview; roundStarted: boolean; showStats: boolean }) {
  const [net, setNet] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);
  const scoring = matchScoring(match);
  const showNet = scoring === "Net" || (scoring === "Both" && net);
  const scored = withHoleStandings({ ...full, matches: full.matches });
  const pairings = scored.matches.filter((p) => (p.round ?? full.round) === match.round);
  const original = full.matches.filter((p) => (p.round ?? full.round) === match.round);
  const offset = competitionMatchOffset(full, match.round);
  // The two teams: the matches' own side names when every match is the same two, else the competition's two sides.
  const sideNames = pairings.map((m) => [normalizeCompetitor(m.left).name, m.right ? normalizeCompetitor(m.right).name : undefined]);
  const same = sideNames.length > 0 && !!sideNames[0][0] && !!sideNames[0][1] && sideNames.every(([l, r]) => l === sideNames[0][0] && r === sideNames[0][1]);
  const teamNames: [string, string] = same ? [sideNames[0][0]!, sideNames[0][1]!] : [match.sides[0]?.name ?? "Team A", match.sides[1]?.name ?? "Team B"];
  if (!pairings.length) return <Empty text="Your matchups will show here" />;
  return (
    <View style={{ gap: 10, marginTop: 12 }}>
      {scoring === "Both" && <View style={[styles.switch, { alignSelf: "flex-end", width: 160 }]} accessibilityRole="radiogroup" accessibilityLabel="Scoring">
        {[false, true].map((value) => <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: net === value }} onPress={() => setNet(value)} style={[styles.switchTab, net === value && styles.switchOn]}>
          <Text style={[styles.switchText, net === value && styles.switchTextOn]}>{value ? "Net" : "Gross"}</Text></Pressable>)}
      </View>}
      {pairings.map((pairing, i) => {
        const left = normalizeCompetitor(pairing.left);
        const right = pairing.right ? normalizeCompetitor(pairing.right) : undefined;
        const standing = (showNet ? pairing.net : pairing.gross) ?? null;
        const status = pairingStatus(left, right, standing, pairing.result, roundStarted);
        const shown = status.kind === "tee" ? null : standing;
        const middle = status.kind === "final" ? "FINAL" : status.kind === "thru" ? `THRU ${status.holes}` : status.time || "TBD";
        const lead = (side: "left" | "right") => shown?.leader === side;
        return <Pressable key={i} style={styles.matchCard} accessibilityRole="button" accessibilityLabel={`Open match ${offset + i + 1}`} onPress={() => setOpened(i)}>
          <MatchSide names={left.golfers.map((g) => g.name)} team={left.name} score={sideScore(status, shown, "left")} leading={lead("left")} />
          <View style={styles.matchMiddle}><Text style={styles.matchNumber}>Match {offset + i + 1}</Text><Text style={styles.matchStatus}>{middle}</Text>
            {status.kind === "final" && <Text style={styles.matchResult}>{status.text}</Text>}</View>
          <MatchSide names={right?.golfers.map((g) => g.name) ?? ["—"]} team={right?.name} score={sideScore(status, shown, "right")} leading={lead("right")} align="right" />
        </Pressable>;
      })}
      {opened !== null && original[opened] && <TripMatchDetail match={full} pairing={original[opened]} number={offset + opened + 1} round={match.round}
        net={showNet} teamNames={teamNames} showStats={showStats} onClose={() => setOpened(null)} />}
    </View>
  );
}

function MatchSide({ names, team, score, leading, align = "left" }: { names: string[]; team?: string; score: string; leading: boolean; align?: "left" | "right" }) {
  return (
    <View style={[styles.matchSide, align === "right" && { alignItems: "flex-end" }, leading && styles.matchLead]}>
      {!!team && <Text style={styles.matchTeam} numberOfLines={1}>{team}</Text>}
      {names.map((n) => <Text key={n} style={[styles.playerName, align === "right" && { textAlign: "right" }]} numberOfLines={1}>{n}</Text>)}
      {!!score && <Text style={styles.sideScore}>{score}</Text>}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <View style={[styles.board, { alignItems: "center", paddingVertical: 28 }]}><Text style={styles.muted}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 48 },
  section: { marginTop: 14 },
  day: { marginHorizontal: gutter, marginTop: 12, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorder, backgroundColor: colors.boardTop },
  profile: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  name: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  username: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(255,255,255,0.6)" },
  summary: { flexDirection: "row", gap: 8 },
  statLabel: { fontFamily: fonts.capsBold, fontSize: 10, letterSpacing: 0.8, color: colors.boardGold, textTransform: "uppercase" },
  statValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  date: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  dayCourse: { fontFamily: fonts.semibold, fontSize: 15, color: colors.cream },
  dayMatch: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  navRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginHorizontal: gutter, gap: 8 },
  pill: { flex: 1, flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: colors.inputOnMaroon, borderWidth: 1, borderColor: colors.avatarRing },
  pillTab: { flex: 1, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  pillTabOn: { backgroundColor: colors.cream },
  pillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  pillTextOn: { color: colors.maroon900 },
  handle: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  handleBar: { width: 28, height: 5, borderRadius: 3, backgroundColor: colors.boardBorder },
  switch: { flexDirection: "row", marginHorizontal: gutter, marginTop: 10, padding: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.avatarRing },
  switchTab: { flex: 1, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  switchOn: { backgroundColor: colors.goldBright },
  switchText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.boardInk },
  switchTextOn: { color: colors.maroon900 },
  rounds: { marginTop: 12, alignItems: "center", gap: 4 },
  roundPill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.avatarRing, justifyContent: "center" },
  roundPillOn: { backgroundColor: colors.cream, borderColor: colors.cream },
  roundText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  roundTextOn: { color: colors.maroon900 },
  roundCourse: { marginTop: 6, fontFamily: fonts.bold, fontSize: 16, color: colors.cream, textAlign: "center", paddingHorizontal: gutter },
  roundFormat: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  notice: { marginHorizontal: gutter, marginTop: 12, padding: 12, borderRadius: radius.control, backgroundColor: colors.inviteFill, borderWidth: 1, borderColor: colors.avatarRing },
  noticeTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  noticeText: { fontFamily: fonts.regular, fontSize: 13, color: colors.boardInk },
  board: { marginHorizontal: gutter, marginTop: 12, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: colors.avatarRing, backgroundColor: colors.boardBottom },
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  headRow: { borderTopWidth: 0, paddingVertical: 4 },
  colLabel: { fontFamily: fonts.capsBold, fontSize: 10, letterSpacing: 0.8, color: colors.boardGold },
  pos: { width: 30 },
  num: { width: 38, textAlign: "center" },
  num2: { width: 38, textAlign: "center", fontFamily: fonts.bold, fontSize: 14, color: colors.cream, fontVariant: ["tabular-nums"] },
  rank: { fontFamily: fonts.bold, fontSize: 13, color: colors.avatarGold },
  player: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  playerName: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  cardTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.cream },
  teeRow: { flexDirection: "row", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  teeTime: { width: 84, fontFamily: fonts.bold, fontSize: 14, color: colors.avatarGold },
  teePlayer: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  teamBox: { marginHorizontal: gutter, marginTop: 12, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorder, backgroundColor: colors.boardTop, flexDirection: "row", alignItems: "center" },
  teamSide: { flex: 1, alignItems: "center" },
  teamName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  teamScore: { fontFamily: fonts.bold, fontSize: 32, color: colors.cream },
  toWin: { fontFamily: fonts.bold, fontSize: 20, color: colors.goldBright },
  matchCard: { marginHorizontal: gutter, flexDirection: "row", alignItems: "stretch", borderRadius: radius.card, borderWidth: 1, borderColor: colors.avatarRing, backgroundColor: colors.boardBottom, overflow: "hidden" },
  matchSide: { flex: 1, padding: 10, gap: 2, minWidth: 0 },
  matchLead: { backgroundColor: "rgba(201,168,110,0.14)" },
  matchTeam: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  sideScore: { marginTop: 4, fontFamily: fonts.bold, fontSize: 15, color: colors.goldBright },
  matchMiddle: { width: 84, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderLeftWidth: 1, borderRightWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  matchNumber: { fontFamily: fonts.semibold, fontSize: 12, color: colors.boardLink },
  matchStatus: { marginTop: 2, fontFamily: fonts.capsBold, fontSize: 11, letterSpacing: 0.6, color: colors.cream },
  cardCell: { flex: 1, alignItems: "center", gap: 2 },
  cardHole: { fontFamily: fonts.capsSemibold, fontSize: 10, color: colors.boardGold },
  cardPar: { fontFamily: fonts.regular, fontSize: 12, color: colors.boardInk },
  cardScore: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream, minHeight: 20 },
  matchResult: { fontFamily: fonts.bold, fontSize: 14, color: colors.goldBright },
});
