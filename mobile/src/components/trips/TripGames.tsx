import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { roundDay } from "@/lib/platform/golfTab";
import type { GolfMatchPreview } from "@/lib/platform/golfTripPreviewFixture";
import { gameDef, scoreGame, wolfFor, type GameConfig, type GameId, type GameResult, type HoleInput } from "@/lib/platform/roundGames";
import { currentHole, gameCourse, gamePlayers, gameStrokes, holesThru, organizerGames as fromOrganizer, parThru, snakeFromPutts, teamsOn, tidyTripGameResult,
  tripGameNeedsSetup, tripGameRound, tripGameSettled, TRIP_GAMES, vegasByHole, type TripGame } from "@/lib/platform/tripGames";
import { savedTripGamesFromJson, tripGameFromSaved, type TripGameAction } from "@/lib/platform/tripGamesRows";
import { apiRaw } from "~/lib/api.ts";
import { HoleGame } from "~/components/round/HoleGame.tsx";
import { PillToggle } from "~/components/PillToggle.tsx";
import { SheetClose } from "~/components/SheetClose.tsx";
import { colors, fonts, gutter, minTap, radius } from "~/lib/theme.ts";

/**
 * Golf → Games in the app (website GolfTripGames, project_specs.md Golf Trips part 2d slice 2): games with the people in
 * my group, saved on the trip (supabase/golf_trip_games.sql) through /api/golf-trips/<trip>/games, so every phone in the
 * group sees the same games and picks. Same scoring as Play (`scoreGame`). The organizer's games for each round are made
 * for my group once (the database keeps one copy however many phones open it). Refreshes every 15s and on return to the app.
 */

export type TripGamesContext = { tripId: string; meId: string; group: { profileId: string; name: string }[]; organizerGames: Record<string, GameId[]> | undefined };
type RoundInfo = { number: number; date?: string; course?: string };
const firstName = (name: string) => name.split(/\s+/)[0];
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });

export function TripGames({ match, rounds, saved }: { match: GolfMatchPreview; rounds: RoundInfo[]; saved: TripGamesContext }) {
  const me = saved.group.find((p) => p.profileId === saved.meId)?.name ?? "You";
  const group = [me, ...saved.group.map((p) => p.name).filter((n) => n !== me)];
  const [games, setGames] = useState<(TripGame & { mine?: boolean })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = `/api/golf-trips/${saved.tripId}/games`;

  const apply = useCallback((body: unknown) => {
    const list = savedTripGamesFromJson((body as { games?: unknown } | null)?.games);
    if (list) { setGames(list.map(tripGameFromSaved)); setLoaded(true); }
  }, []);
  const load = useCallback(async () => {
    const { status, body } = await apiRaw<{ ok?: boolean; games?: unknown; error?: string }>(path);
    if (status === 200 && body?.ok) { apply(body); setError(null); }
    else if (status === 0) setError("You're offline. Games refresh when you're back online.");
    else if (!loaded) setError(body?.error ?? "Couldn't load games. Pull to refresh.");
  }, [path, apply, loaded]);
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void load(); });
    return () => { clearInterval(poll); sub.remove(); };
  }, [load]);
  const send = async (action: TripGameAction) => {
    setError(null);
    const { status, body } = await apiRaw<{ ok?: boolean; games?: unknown; error?: string }>(path, { method: "POST", body: action });
    if (status === 200 && body?.ok) apply(body);
    else setError(status === 0 ? "You're offline. Try again when you're back online." : body?.error ?? "Couldn't save that. Try again.");
  };
  const profileOf = (name: string) => saved.group.find((p) => p.name === name)?.profileId ?? "";
  const create = (game: TripGame) => send({ action: "create", round: game.round, requestId: uuid(),
    game: { gameType: game.config.id, net: game.config.net, birdiesDouble: game.config.birdiesDouble, ...(game.config.teams ? { teams: game.config.teams } : {}), players: game.players.map(profileOf) } });

  // Organizer → Games: the games put on each round show up for my group, ready to play (asked for once per phone visit).
  const asked = useRef(new Set<string>());
  const wanted = fromOrganizer(saved.organizerGames, group, games);
  const wantedKey = wanted.map((g) => g.key).join(",");
  useEffect(() => {
    if (!loaded) return;
    for (const g of wanted.filter((g) => !asked.current.has(g.key))) { asked.current.add(g.key); void create(g); }
  }, [wantedKey, loaded]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the organizer's list (or what's already made) changes

  const [view, setView] = useState<"Active" | "Settled">("Active");
  const [creating, setCreating] = useState(false);
  const visible = games.filter((g) => g.players.includes(me) && tripGameSettled(match, g) === (view === "Settled"));

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.switch} accessibilityRole="tablist" accessibilityLabel="Game status">
        {(["Active", "Settled"] as const).map((s) => <Pressable key={s} accessibilityRole="tab" accessibilityState={{ selected: view === s }} onPress={() => setView(s)} style={[styles.switchItem, view === s && styles.on]}>
          <Text style={[styles.switchText, view === s && styles.onText]}>{s}</Text>
        </Pressable>)}
      </View>
      <View style={styles.head}>
        <Text style={styles.title}>Your Games</Text>
        <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={styles.newButton}><Text style={styles.newText}>+ New game</Text></Pressable>
      </View>
      {!loaded && !error && <Text style={styles.empty}>Loading games…</Text>}
      {loaded && !visible.length && <Text style={styles.empty}>{view === "Settled" ? "No settled games yet. Completed games will appear here." : "No active games. Tap New game to start one."}</Text>}
      {visible.map((game) => {
        const remove = game.mine !== false ? () => void send({ action: "delete", gameId: game.key }) : undefined;
        const pick = (hole: number, next: HoleInput) => {
          setGames((list) => list.map((g) => g.key !== game.key ? g : { ...g, inputs: Object.assign([...g.inputs], { [hole]: next }) }));
          void send({ action: "pick", gameId: game.key, hole: hole + 1, pick: Object.values(next).some((v) => v !== undefined) ? next : null });
        };
        return game.started || !tripGameNeedsSetup(game.config.id)
          ? <GameCard key={game.key} game={game} match={tripGameRound(match, game)} settled={view === "Settled"} onRemove={view === "Active" ? remove : undefined} onInput={pick} />
          : <PreRound key={game.key} game={game} onRemove={remove}
            onTeams={(teams) => { setGames((list) => list.map((g) => g.key === game.key ? { ...g, config: { ...g.config, teams } } : g)); void send({ action: "update", gameId: game.key, patch: { teams } }); }}
            onStart={() => void send({ action: "update", gameId: game.key, patch: { started: true } })} />;
      })}
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {creating && <NewGame group={group} rounds={rounds.length ? rounds : [{ number: match.round, date: match.roundDate, course: match.course }]} current={match.round}
        onClose={() => setCreating(false)} onCreate={(game) => { setCreating(false); setView("Active"); void create(game); }} />}
    </View>
  );
}

/** A game during its round: the hole's pick (Wolf partner, Daytona spots, Vegas teams …) and the standings, scored like Play. */
function GameCard({ game, match, onInput, onRemove, settled }: { game: TripGame; match: GolfMatchPreview; onInput: (hole: number, next: HoleInput) => void; onRemove?: () => void; settled: boolean }) {
  const def = gameDef(game.config.id);
  const holes = match.par.length, range: [number, number] = [0, holes];
  const strokes = gameStrokes(match, game);
  const live = match.round === game.round && holes > 0 && match.leaderboard.length > 0;
  const now = currentHole(strokes, holes);
  const [shown, setShown] = useState<number | null>(null);
  const hole = shown ?? now;
  const players = gamePlayers(match, game.players);
  const inputs = def.holeInput === "snake" ? snakeFromPutts(match, game) : game.inputs;
  const vegas = game.config.id === "vegas";
  const result = !live ? null : vegas ? vegasByHole(game, players, gameCourse(match), strokes)
    : tidyTripGameResult(scoreGame(game.config, players, gameCourse(match), range, strokes, inputs), game.config.id, parThru(match, strokes));
  const thru = holesThru(strokes, holes);
  const names = game.players.map(firstName);
  const picks = !settled && (vegas || (def.holeInput && def.holeInput !== "snake"));
  return <View style={styles.card} accessibilityLabel={def.name}>
    <View style={styles.cardHead}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{def.name}</Text>
        <Text style={styles.small}>Round {game.round} · {game.config.net ? "Net" : "Gross"}{game.config.birdiesDouble ? " · Birdies double" : ""}{live ? ` · Thru ${thru}` : ""}</Text>
      </View>
      {onRemove && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${def.name}`} onPress={onRemove} style={styles.smallButton}><Text style={styles.smallButtonText}>Remove</Text></Pressable>}
    </View>
    {!(live && def.teams) && <Text style={styles.small}>{game.config.teams && def.teams
      ? [0, 1].map((t) => game.players.filter((_, i) => game.config.teams![i] === t).map(firstName).join(" & ")).join("  vs  ") : names.join(" · ")}</Text>}
    {!live ? <Text style={styles.small}>Scores show here during Round {game.round}.</Text> : <>
      {picks && <View style={{ gap: 8 }}>
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous hole" disabled={hole <= 0} onPress={() => setShown(Math.max(0, hole - 1))} style={styles.stepButton}><Text style={[styles.arrow, hole <= 0 && styles.dim]}>‹</Text></Pressable>
          <Text style={styles.stepText}>Hole {hole + 1}{hole === now && thru < holes ? " · now" : ""}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next hole" disabled={hole >= holes - 1} onPress={() => setShown(Math.min(holes - 1, hole + 1))} style={styles.stepButton}><Text style={[styles.arrow, hole >= holes - 1 && styles.dim]}>›</Text></Pressable>
        </View>
        {vegas ? <TeamPicks key={hole} names={names} teams={teamsOn(game, hole)} onChange={(teams) => onInput(hole, { ...game.inputs[hole], teams })} />
          : <HoleGame game={game.config} gameFits sideGames={undefined} hole={hole} range={range} par={match.par} names={names} input={game.inputs[hole] ?? {}}
            onChange={(next) => onInput(hole, next)} locked={false} />}
        {def.holeInput === "wolf" && <Text style={styles.small}>{names[wolfFor(hole, range, names.length)]} is the Wolf</Text>}
      </View>}
      {result && <Standings result={result} />}
    </>}
  </View>;
}

function Standings({ result }: { result: GameResult }) {
  return <View style={styles.standings} accessibilityLabel={result.title}>
    <Text style={styles.label}>{result.title}</Text>
    {result.standings.map((s, i) => <View key={i} style={styles.standingRow}>
      <Text style={styles.standingName} numberOfLines={1}>{s.label}</Text>
      <Text style={styles.standingValue}>{s.value}{s.money !== undefined ? `${s.value ? " · " : ""}${s.money === 0 ? "$0" : `${s.money > 0 ? "+" : "−"}$${Math.abs(s.money)}`}` : ""}</Text>
    </View>)}
    {result.note && <Text style={styles.small}>{result.note}</Text>}
  </View>;
}

/** Before the round: pick the teams, then Start. */
function PreRound({ game, onTeams, onStart, onRemove }: { game: TripGame; onTeams: (teams: number[]) => void; onStart: () => void; onRemove?: () => void }) {
  const def = gameDef(game.config.id);
  const teams = game.config.teams ?? game.players.map((_, i) => i < game.players.length / 2 ? 0 : 1);
  const ok = teams.includes(0) && teams.includes(1);
  return <View style={styles.card} accessibilityLabel={`${def.name} setup`}>
    <View style={styles.cardHead}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{def.name}</Text>
        <Text style={styles.small}>Round {game.round} · {game.config.net ? "Net" : "Gross"}{game.config.birdiesDouble ? " · Birdies double" : ""} · Pick teams</Text>
      </View>
      {onRemove && <Pressable accessibilityRole="button" onPress={onRemove} style={styles.smallButton}><Text style={styles.smallButtonText}>Remove</Text></Pressable>}
    </View>
    <Text style={styles.small}>{def.blurb}</Text>
    <TeamPicks names={game.players} teams={teams} onChange={onTeams} />
    {!ok && <Text style={styles.small}>Put at least one player on each team.</Text>}
    <Pressable accessibilityRole="button" disabled={!ok} onPress={onStart} style={[styles.primary, !ok && styles.dim]}><Text style={styles.primaryText}>Start game</Text></Pressable>
  </View>;
}

/** Teams by arrows: ← left team, → right team, one row per player. */
function TeamPicks({ names, teams, onChange }: { names: string[]; teams: number[]; onChange: (teams: number[]) => void }) {
  const set = (i: number, t: number) => onChange(Object.assign([...teams], { [i]: t }));
  return <View style={{ gap: 6 }}>
    {names.map((name, i) => <View key={i} style={styles.teamRow}>
      <Text style={styles.standingName}>{name}</Text>
      {[0, 1].map((t) => <Pressable key={t} accessibilityRole="button" accessibilityLabel={`${name} on the ${t ? "right" : "left"} team`} accessibilityState={{ selected: teams[i] === t }}
        onPress={() => set(i, t)} style={[styles.arrowButton, teams[i] === t && styles.on]}><Text style={[styles.arrowText, teams[i] === t && styles.onText]}>{t ? "→" : "←"}</Text></Pressable>)}
    </View>)}
  </View>;
}

/** New game: round (< >), game (< >), Handicaps and Birdies double, players from my group, then Set game. */
function NewGame({ group, rounds, current, onClose, onCreate }: { group: string[]; rounds: RoundInfo[]; current: number; onClose: () => void; onCreate: (game: TripGame) => void }) {
  const [roundIndex, setRoundIndex] = useState(Math.max(0, rounds.findIndex((r) => r.number === current)));
  const round = rounds[roundIndex] ?? rounds[0];
  const [players, setPlayers] = useState<string[]>(group);
  const [gameIndex, setGameIndex] = useState(-1);
  const [net, setNet] = useState(false);
  const [birdiesDouble, setBirdiesDouble] = useState(false);
  const def = gameIndex >= 0 ? TRIP_GAMES[gameIndex] : null;
  const fits = Boolean(def && def.players.includes(players.length));
  const birdiesUsed = !def || def.points;
  const toggle = (name: string) => setPlayers((list) => list.includes(name) ? list.filter((n) => n !== name) : group.filter((n) => list.includes(n) || n === name));
  const create = () => {
    if (!def || !fits) return;
    const config: GameConfig = { id: def.id, net, birdiesDouble: def.points && birdiesDouble, ...(def.teams ? { teams: players.map((_, i) => i < players.length / 2 ? 0 : 1) } : {}) };
    onCreate({ key: `${Date.now()}`, round: round.number, players, inputs: [], started: !tripGameNeedsSetup(def.id), config });
  };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.page} edges={["bottom"]}>
      <View style={styles.sheetTop}><Text style={styles.title}>New game</Text><SheetClose onPress={onClose} /></View>
      <ScrollView contentContainerStyle={{ padding: gutter, gap: 14 }}>
        <Step label={`${round.date ? `${roundDay(round.date)} · ` : ""}Round ${round.number}`} value={round.course || "Course TBD"} prev={roundIndex > 0} next={roundIndex < rounds.length - 1}
          onPrev={() => setRoundIndex(roundIndex - 1)} onNext={() => setRoundIndex(roundIndex + 1)} name="round" />
        <Step label={`Game${def ? ` · ${def.players.join(", ")} players` : ""}`} value={def ? def.name : "Choose a game"} prev={gameIndex > 0} next={gameIndex < TRIP_GAMES.length - 1}
          onPrev={() => setGameIndex(gameIndex - 1)} onNext={() => setGameIndex(gameIndex + 1)} name="game" />
        {def && <Text style={styles.small}>{def.blurb}</Text>}
        <PillToggle tone="dark" label="Handicaps" value={net} onChange={setNet} />
        <PillToggle tone="dark" label="Birdies double" value={birdiesUsed && birdiesDouble} onChange={setBirdiesDouble} disabled={!birdiesUsed} />
        <Text style={styles.label}>Players · your group</Text>
        {group.map((name, i) => {
          const on = players.includes(name);
          return <Pressable key={name} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: i === 0 }} disabled={i === 0} onPress={() => toggle(name)} style={styles.playerRow}>
            <View style={[styles.box, on && styles.on]}>{on && <Text style={styles.onText}>✓</Text>}</View>
            <Text style={styles.standingName}>{name}{i === 0 ? "  (You)" : ""}</Text>
          </Pressable>;
        })}
        {def && !fits && <Text style={styles.error} accessibilityRole="text">{def.name} is for {def.players.join(", ")} players. You have {players.length}.</Text>}
      </ScrollView>
      <View style={{ padding: gutter }}>
        <Pressable accessibilityRole="button" disabled={!fits} onPress={create} style={[styles.primary, !fits && styles.dim]}><Text style={styles.primaryText}>Set game</Text></Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

function Step({ label, value, prev, next, onPrev, onNext, name }: { label: string; value: string; prev: boolean; next: boolean; onPrev: () => void; onNext: () => void; name: string }) {
  return <View style={styles.stepBox}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${name}`} disabled={!prev} onPress={onPrev} style={styles.stepButton}><Text style={[styles.arrow, !prev && styles.dim]}>‹</Text></Pressable>
    <View style={{ flex: 1, alignItems: "center" }} accessibilityLiveRegion="polite"><Text style={styles.small}>{label}</Text><Text style={styles.cardTitle} numberOfLines={1}>{value}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Next ${name}`} disabled={!next} onPress={onNext} style={styles.stepButton}><Text style={[styles.arrow, !next && styles.dim]}>›</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.maroon900 },
  sheetTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter, paddingTop: 14, minHeight: 56 },
  switch: { flexDirection: "row", marginHorizontal: gutter, borderBottomWidth: 1, borderBottomColor: colors.boardBorderSoft },
  switchItem: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderTopLeftRadius: radius.control, borderTopRightRadius: radius.control },
  switchText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.boardInk },
  on: { backgroundColor: colors.goldBright, borderColor: colors.goldBright },
  onText: { color: colors.maroon900, fontFamily: fonts.bold },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: gutter },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.cream },
  newButton: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.goldBright, justifyContent: "center" },
  newText: { fontFamily: fonts.bold, fontSize: 14, color: colors.maroon900 },
  empty: { marginHorizontal: gutter, fontFamily: fonts.regular, fontSize: 14, color: colors.boardInk, textAlign: "center", paddingVertical: 12 },
  error: { marginHorizontal: gutter, fontFamily: fonts.semibold, fontSize: 13, color: colors.errorOnMaroon },
  card: { marginHorizontal: gutter, padding: 14, gap: 8, borderRadius: radius.card, borderWidth: 1, borderColor: colors.boardBorderSoft, backgroundColor: colors.boardBottom },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.cream },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.boardInk },
  label: { fontFamily: fonts.capsSemibold, fontSize: 11, letterSpacing: 0.6, color: colors.boardGold, textTransform: "uppercase" },
  smallButton: { minHeight: 32, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.boardBorderSoft, justifyContent: "center" },
  smallButtonText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.boardInk },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepBox: { flexDirection: "row", alignItems: "center", padding: 6, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorderSoft },
  stepButton: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  stepText: { fontFamily: fonts.bold, fontSize: 15, color: colors.cream },
  arrow: { fontFamily: fonts.bold, fontSize: 28, color: colors.goldBright },
  dim: { opacity: 0.35 },
  standings: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  standingRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 3 },
  standingName: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.cream },
  standingValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.cream, fontVariant: ["tabular-nums"] },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  arrowButton: { width: minTap, height: 36, borderRadius: radius.control, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
  arrowText: { fontFamily: fonts.bold, fontSize: 16, color: colors.cream },
  primary: { minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.goldBright, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.maroon900 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: minTap },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.boardBorder, alignItems: "center", justifyContent: "center" },
});
