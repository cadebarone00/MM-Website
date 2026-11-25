import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { teeTimeLabel } from "@/lib/platform/codeTournaments";
import {
  cardOf, gameCourse, groupOrder, leaderboard, PAIR_FORMATS, pairResults, pairsByPoints, SEGMENT_OPTIONS, skins, toParLabel, ungrouped,
  type League, type LeagueGroup,
} from "@/lib/platform/leagues";
import { gameDef, scoreGame, type GameConfig, type GameId, type GameResult } from "@/lib/platform/roundGames";
import { playersLabel } from "@/lib/platform/roundSetupForm";
import { PillToggle } from "~/components/PillToggle.tsx";
import { GamePicker } from "~/components/setup/GamePicker.tsx";
import { firstName, groupProgress, placeLabel } from "~/lib/leaguesUi.ts";
import { colors, fonts, radius } from "~/lib/theme.ts";

/** A white card on the maroon league page (keeps every section the same look). */
export function LeagueCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export const LeagueNote = ({ children }: { children: ReactNode }) => <Text style={styles.note}>{children}</Text>;

/** The first screen: everyone's total strokes so far, Gross or Net as the organizer set it (website Leaderboard). */
export function LeaderboardView({ league, meId }: { league: League; meId: string }) {
  const rows = leaderboard(league, league.scoring);
  const all = rows.map((r) => r.position);
  if (!rows.length) return <LeagueCard><LeagueNote>No players yet. Share the code so people can join.</LeagueNote></LeagueCard>;
  return (
    <LeagueCard>
      <Row head cells={["Pos", "Player", "To par", "Thru", league.scoring]} />
      {rows.map((r) => (
        <Row key={r.profileId} me={r.profileId === meId} under={(r.toPar ?? 0) < 0}
          cells={[placeLabel(r.position, all), r.name, toParLabel(r.toPar), r.thru === 0 ? "–" : r.thru === 18 ? "F" : String(r.thru), r.total == null ? "–" : String(r.total)]} />
      ))}
    </LeagueCard>
  );
}

/** League-wide skins: who has won, then each hole; the organizer's Carryover switch (website SkinsView). */
export function SkinsView({ league, isOrganizer, onCarryover }: { league: League; isOrganizer: boolean; onCarryover: (on: boolean) => void }) {
  const result = skins(league);
  const nameOf = (id: string | null) => league.players.find((p) => p.profileId === id)?.name ?? "";
  return (
    <View style={styles.stack}>
      {isOrganizer && <LeagueCard><PillToggle label="Carryover" note="A tied hole's skin adds to the next one" value={league.skins.carryover} onChange={onCarryover} /></LeagueCard>}
      {result.totals.length > 0 && (
        <LeagueCard>
          {result.totals.map((t) => <View key={t.profileId} style={styles.line}><Text style={styles.lineName}>{t.name}</Text><Text style={styles.lineValue}>{t.skins}</Text></View>)}
        </LeagueCard>
      )}
      <LeagueCard>
        {result.holes.map((h) => (
          <View key={h.hole} style={styles.line}>
            <Text style={styles.hole}>{h.hole}</Text>
            <Text style={[styles.lineName, h.status === "open" && styles.muted]}>{h.status === "won" ? nameOf(h.winner) : h.status === "tied" ? "Tie" : "—"}</Text>
            {h.status === "won" && h.value > 1 ? <Text style={styles.lineValue}>{`×${h.value}`}</Text> : null}
          </View>
        ))}
      </LeagueCard>
    </View>
  );
}

/** The 2-person pairs game: format, then a leaderboard per segment, Final + winners (website PairsView). */
export function PairsView({ league, meId }: { league: League; meId: string }) {
  if (!league.pairs.locked) return <LeagueCard><LeagueNote>The pairs haven&apos;t been drawn yet. The organizer draws them in League Settings.</LeagueNote></LeagueCard>;
  const format = PAIR_FORMATS.find((f) => f.id === league.pairs.format);
  const points = pairsByPoints(league.pairs.format);
  const short = (id: string) => firstName(league.players.find((p) => p.profileId === id)?.name ?? "");
  return (
    <View style={styles.stack}>
      <Text style={styles.onMaroon}>{`${format?.name ?? ""} · ${league.pairs.net ? "Net" : "Gross"} · ${SEGMENT_OPTIONS.find((s) => s.value === league.pairs.segments)?.name ?? ""}`}</Text>
      {pairResults(league).map((segment) => (
        <LeagueCard key={segment.label}>
          <Text style={styles.cardTitle}>{`${segment.label}${segment.final ? " · Final" : ""}`}</Text>
          {segment.final && <Text style={styles.winner}>{`${segment.winners.length > 1 ? "Tied: " : "Winners: "}${segment.winners.map((team) => team.map(short).join(" & ")).join(", ")}`}</Text>}
          <Row head cells={["Pos", "Pair", "Thru", points ? "Points" : "To par"]} />
          {segment.standings.map((s) => (
            <Row key={s.team.join()} me={s.team.includes(meId)} under={!points && (s.toPar ?? 0) < 0}
              cells={[placeLabel(s.position, segment.standings.map((x) => x.position)), s.names, s.thru ? String(s.thru) : "–", points ? (s.total == null ? "–" : String(s.total)) : toParLabel(s.toPar)]} />
          ))}
        </LeagueCard>
      ))}
    </View>
  );
}

/** Tee Times: each group's time, hole, progress, players + handicaps, the scorer; who's not in a group (website GroupsView). */
export function TeeTimesView({ league, meId, isOrganizer }: { league: League; meId: string; isOrganizer: boolean }) {
  const loose = ungrouped(league);
  if (!league.groups.length) return <LeagueCard><LeagueNote>{`No tee times yet.${isOrganizer ? " Make them in League Settings once your players have joined." : " The organizer will set them."}`}</LeagueNote></LeagueCard>;
  return (
    <View style={styles.stack}>
      {loose.length > 0 && <Text style={styles.onMaroon}>{`Not in a group yet: ${loose.map((p) => p.name).join(", ")}`}</Text>}
      {league.groups.map((g) => {
        const thru = Math.min(...g.players.map((id) => cardOf(league, id).filter((s) => s != null).length));
        return (
          <View key={g.number} style={[styles.card, g.players.includes(meId) && styles.mine]}>
            <Text style={styles.cardTitle}>{`Group ${g.number}`}</Text>
            <Text style={styles.note}>{`${g.time ? teeTimeLabel(g.time) : "Time TBD"} · Hole ${g.hole} · ${groupProgress(Boolean(g.submitted), thru)}`}</Text>
            {g.players.map((id) => {
              const p = league.players.find((x) => x.profileId === id);
              return (
                <View key={id} style={styles.line}>
                  <Text style={styles.lineName}>{p?.name ?? "Player"}{id === g.scorer ? <Text style={styles.tag}>{"  SCORER"}</Text> : null}</Text>
                  <Text style={styles.lineValue}>{p?.handicap == null ? "–" : p.handicap.toFixed(1)}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** The group's game and how it stands, once the group has one that fits its size (scorer = player 0, as in Play). */
export function groupGame(league: League, group: LeagueGroup): { config: GameConfig; names: string[]; result: GameResult } | null {
  const config = group.game;
  if (!config || !gameDef(config.id).players.includes(group.players.length)) return null;
  const order = groupOrder(group);
  const players = order.map((id) => league.players.find((p) => p.profileId === id)).filter((p): p is League["players"][number] => !!p);
  if (players.length !== order.length) return null;
  const names = players.map((p) => firstName(p.name));
  const result = scoreGame(config, players.map((p) => ({ name: firstName(p.name), handicap: p.handicap })), gameCourse(league.course), [0, 18], order.map((id) => cardOf(league, id)), group.inputs ?? []);
  return { config, names, result };
}

/**
 * Group: my group's own game, exactly like Play (website GroupGame). The scorer picks it (teams, Net, Birdies double);
 * everyone in the group sees how it stands.
 */
export function GroupGameView({ league, group, meId, editable, onGame }: { league: League; group: LeagueGroup; meId: string; editable: boolean; onGame: (game: GameConfig | null) => void }) {
  const isScorer = group.scorer === meId && editable;
  const config = group.game ?? null;
  const def = config ? gameDef(config.id) : null;
  const size = group.players.length;
  const fits = !def || def.players.includes(size);
  const playing = groupGame(league, group);
  const order = groupOrder(group);
  const nameOf = (id: string) => firstName(league.players.find((p) => p.profileId === id)?.name ?? "Player");
  const teams = config?.teams ?? order.map((_, i) => (i < size / 2 ? 0 : 1));
  const pick = (id: GameId | "") => {
    if (!id) { onGame(null); return; }
    const next = gameDef(id);
    onGame({ id, net: !next.teamFormat && (config?.net ?? false), birdiesDouble: next.points && (config?.birdiesDouble ?? false), ...(next.teams ? { teams: order.map((_, i) => (i < size / 2 ? 0 : 1)) } : {}) });
  };
  if (!isScorer && !config) return <LeagueCard><LeagueNote>{`No group game. ${nameOf(group.scorer)} can pick one.`}</LeagueNote></LeagueCard>;
  return (
    <View style={styles.stack}>
      {isScorer ? (
        <View style={styles.darkBox}>
          <GamePicker gameId={config?.id ?? ""} onPick={pick} />
          {def && <Text style={styles.onMaroon}>{def.blurb}</Text>}
          {def && !fits && <Text style={styles.warn}>{`${def.name} needs ${playersLabel(def.players)}; your group has ${size}.`}</Text>}
          {config && def && fits && def.teams && size > 2 && order.map((id, i) => (
            <PillToggle key={id} tone="dark" label={nameOf(id)} note={teams[i] === 0 ? "Team 1" : "Team 2"} value={teams[i] === 1}
              onChange={() => onGame({ ...config, teams: teams.map((t, j) => (j === i ? 1 - t : t)) })} />
          ))}
          {config && def && !def.teamFormat && <PillToggle tone="dark" label="Net (use handicaps)" note="Each player gets strokes from their handicap" value={config.net} onChange={(net) => onGame({ ...config, net })} />}
          {config && def?.points && <PillToggle tone="dark" label="Birdies double points" note="A hole won with a birdie or better is worth double" value={config.birdiesDouble} onChange={(birdiesDouble) => onGame({ ...config, birdiesDouble })} />}
        </View>
      ) : <Text style={styles.onMaroon}>{`${def?.name ?? ""}${config?.net ? " · Net" : ""}${fits ? "" : ` needs ${playersLabel(def?.players ?? [])}; not scored right now.`}`}</Text>}
      {playing && (
        <LeagueCard>
          <Text style={styles.cardTitle}>{playing.result.title}</Text>
          {playing.result.standings.map((s, i) => <View key={i} style={styles.line}><Text style={styles.lineName}>{s.label}</Text><Text style={styles.lineValue}>{s.value}</Text></View>)}
          {playing.result.note ? <LeagueNote>{playing.result.note}</LeagueNote> : null}
        </LeagueCard>
      )}
    </View>
  );
}

/** One table row: the second cell (the name) takes the room; the rest are narrow and right-aligned. */
function Row({ cells, head, me, under }: { cells: string[]; head?: boolean; me?: boolean; under?: boolean }) {
  return (
    <View style={[styles.row, head && styles.headRow, me && styles.meRow]} accessibilityRole={head ? "header" : undefined}>
      {cells.map((cell, i) => (
        <Text key={i} numberOfLines={1} style={[styles.cell, i === 1 ? styles.nameCell : i === 0 ? styles.posCell : styles.numCell, head && styles.headCell,
          !head && i === 2 && under && styles.under, !head && i === cells.length - 1 && styles.total]}>{cell}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { gap: 4, padding: 14, borderRadius: radius.card, backgroundColor: colors.white },
  mine: { borderWidth: 2, borderColor: colors.gold },
  darkBox: { gap: 10 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.maroon900 },
  note: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  onMaroon: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.wizardMuted },
  warn: { fontFamily: fonts.semibold, fontSize: 14, color: colors.errorOnMaroon },
  winner: { fontFamily: fonts.semibold, fontSize: 14, color: colors.maroon700, marginBottom: 4 },
  row: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  headRow: { minHeight: 28, borderTopWidth: 0 },
  meRow: { backgroundColor: colors.paper },
  cell: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  headCell: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.8, color: colors.inkMuted, textTransform: "uppercase" },
  posCell: { width: 34 },
  nameCell: { flex: 1 },
  numCell: { width: 54, textAlign: "right" },
  under: { color: colors.error },
  total: { fontFamily: fonts.bold },
  line: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  hole: { width: 26, fontFamily: fonts.bold, fontSize: 14, color: colors.maroon700 },
  lineName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  lineValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.maroon900 },
  muted: { color: colors.inkMuted, fontFamily: fonts.regular },
  tag: { fontFamily: fonts.capsSemibold, fontSize: 10, letterSpacing: 0.8, color: colors.gold },
});
