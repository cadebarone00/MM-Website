"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GolfTripScoring } from "@/components/platform/GolfTripScoring";
import { CancelRound, HolePicks, SharedRoundScreen, SharedRoundSourceProvider, Standings, type SharedRoundSource } from "@/components/platform/PlayRound";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { ROUND_SAMPLE_DEFAULTS, sampleSharedRound, samplePlayersFor, type RoundSampleOptions } from "@/lib/dev/sampleRoundGames";
import { InviteCodeCard } from "@/components/platform/InviteCodeCard";
import { GAMES, scoreGame, type GameConfig, type GameId, type HoleInput } from "@/lib/platform/roundGames";
import type { SharedRound } from "@/lib/platform/sharedRoundsServer";
import type { SheetCard } from "@/lib/platform/liveCards";
import styles from "@/components/platform/PlayRound.module.css";

/**
 * DEV ONLY (/dev/round): a sample Play round with friends, using the real round pieces (the trip scorecard with the
 * group's scores, the game's per-hole picks and standings, the round's invite code). You're the host, 4 players, Skins
 * net, part way through. Nothing is saved; scores entered here only last until the page reloads.
 * ?view=cancel: the host's Cancel round choices open (Save & exit / Delete round). ?view=player: you're a player, so
 * you only get Leave round.
 * ?game=<id> (Play → Games mid round): the real round-with-friends screen on a made-up round of that game, with the
 * simulator's group size, moment, options and viewer (lib/dev/sampleRoundGames.ts). Changes last until the next pick.
 */
const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const SI = [7, 13, 17, 1, 9, 3, 15, 11, 5, 8, 14, 18, 2, 10, 4, 16, 12, 6];
const PLAYERS = [{ name: "You", handicap: 6.2 }, { name: "Cade", handicap: 11.4 }, { name: "Jake", handicap: 3.8 }, { name: "Luke", handicap: 15.0 }];
const THRU = 6;
const WOBBLE = [0, 1, 0, -1, 1, 0, 2, 0, 1, 0];
const start = PLAYERS.map((_, p) => PAR.map((par, h) => h < THRU ? par + WOBBLE[(p * 7 + h * 3) % 10] : null));
const GAME: GameConfig = { id: "skins", net: true, birdiesDouble: false };
const COURSE = { par: PAR, strokeIndex: SI, rating: 70.4, slope: 124 };

export function DevRoundPreview() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}

function Preview() {
  const params = useSearchParams();
  const game = params.get("game");
  if (game && GAMES.some((g) => g.id === game)) return <GameRound game={game as GameId} />;
  return <SkinsPreview view={params.get("view")} />;
}

/** The simulator's choices as sample options (defaults for anything not picked yet). */
function useRoundOptions(game: GameId): RoundSampleOptions {
  const state = useSimulator()?.state;
  const d = ROUND_SAMPLE_DEFAULTS;
  return {
    game, players: samplePlayersFor(game, state?.roundPlayers), thru: state?.roundThru ?? d.thru, net: state?.roundNet ?? d.net,
    birdies: state?.roundBirdies ?? d.birdies, money: state?.roundMoney ?? d.money, doubled: state?.roundDoubled ?? d.doubled,
    carryovers: state?.roundCarry ?? d.carryovers, autoPress: state?.roundPress ?? d.autoPress, sideGames: state?.roundSide ?? d.sideGames, viewer: state?.roundViewer ?? d.viewer,
  };
}

function GameRound({ game }: { game: GameId }) {
  const options = useRoundOptions(game);
  const key = JSON.stringify(options);
  return <SampleRound key={key} options={options} />;
}

/** The made-up round held in memory: the screen reads it like the server and its changes (scores, picks, settings) apply to it. */
function SampleRound({ options }: { options: RoundSampleOptions }) {
  const [note, setNote] = useState<string | null>(null);
  const source = useMemo<SharedRoundSource>(() => {
    const sample = sampleSharedRound(options);
    const held: { round: SharedRound } = { round: sample.round };
    // Start each sample fresh (this phone's copy of the last sample's card would leak into it).
    try { localStorage.removeItem("maroonDevSampleRound"); } catch { /* private mode */ }
    const setHole = <T extends { hole: number }>(rows: T[], match: (row: T) => boolean, row: T) => [...rows.filter((r) => !match(r)), row];
    return {
      storageKey: "maroonDevSampleRound",
      load: async () => ({ ok: true, round: structuredClone(held.round), me: sample.me, inviteCode: sample.inviteCode }),
      post: async (_id, body) => {
        const b = body as Record<string, unknown> & { hole?: number };
        if (b.action === "strokes") held.round = { ...held.round, holes: setHole(held.round.holes, (r) => r.profileId === b.player && r.hole === b.hole, { profileId: String(b.player), hole: b.hole!, strokes: b.strokes as number | null }) };
        else if (b.action === "guestStrokes") held.round = { ...held.round, guestHoles: setHole(held.round.guestHoles ?? [], (r) => r.guestId === b.guest && r.hole === b.hole, { guestId: String(b.guest), hole: b.hole!, strokes: b.strokes as number | null }) };
        else if (b.action === "pick") held.round = { ...held.round, picks: setHole(held.round.picks, (r) => r.hole === b.hole, { hole: b.hole!, pick: b.pick as HoleInput }) };
        else if (b.action === "setup") held.round = { ...held.round, setup: b.setup as SharedRound["setup"] };
        else setNote(`Sample round: "${String(b.action)}" would happen in a real round. Nothing is saved.`);
        return { ok: true };
      },
      submit: async () => { setNote("Sample round: Save & exit would save everyone's rounds and go back to Play. Nothing was saved."); return { error: "Sample round: nothing is saved." }; },
      exit: () => setNote("Sample round: this would go back to Play."),
    };
  }, [options]);
  const sample = useMemo(() => sampleSharedRound(options), [options]);
  // The scorekeeper's own phone already has their card (as it would mid round), so Scoring opens on the hole being played.
  const card = useMemo<SheetCard>(() => {
    const mine = (h: number) => sample.round.holes.find((x) => x.profileId === sample.round.host && x.hole === h + 1)?.strokes ?? null;
    const par = sample.round.setup.course.par;
    return { strokes: par.map((_, h) => mine(h)), putts: par.map((_, h) => mine(h) == null ? null : 2), fairways: par.map(() => null), greens: par.map(() => null), penalties: [], attestStrokes: [] };
  }, [sample]);
  return <SharedRoundSourceProvider value={source}>
    {note && <p className={styles.note} role="status">{note}</p>}
    <SharedRoundScreen saved={{ setup: sample.round.setup, startedAt: sample.round.startedAt, sharedId: sample.round.id, ...(sample.me === sample.round.host ? { card } : {}) }} startSummaryOpen={options.thru === 18 && options.viewer === "host"} />
  </SharedRoundSourceProvider>;
}

function SkinsPreview({ view }: { view: string | null }) {
  const player = view === "player";
  const [sampleNote, setSampleNote] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<(number | null)[][]>(start);
  const [inputs, setInputs] = useState<HoleInput[]>([]);
  const result = scoreGame(GAME, PLAYERS, COURSE, [0, 18], strokes, inputs);
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/dev" className={styles.back} aria-label="Back to the simulator"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>{player ? "Round with friends" : "Round with friends · you’re the host"}</p></header>
    <section className={styles.panel}>
      <h1 className={styles.title}>Stevens Park Golf Course</h1>
      <p className={styles.place}>Blue · 18 holes · Skins (net)</p>
      <ul className={styles.roster} aria-label="Players">
        {PLAYERS.map((p, i) => <li key={p.name}><span>{p.name}{i === (player ? 1 : 0) && <small>Host</small>}</span><b data-status="joined">Joined</b></li>)}
      </ul>
      <InviteCodeCard kind="round" id="sample" code="K7Q4MZ" name="Stevens Park Golf Course" canEmail={false} />
      <Standings result={result} />
      <p className={styles.note}>Pull up Scoring to enter each hole. Sample round: nothing here is saved.</p>
      {sampleNote && <p className={styles.note} role="status">{sampleNote}</p>}
      {player
        ? <button type="button" className={styles.discard} onClick={() => setSampleNote("Sample: you'd drop out of the round. Scores already in it stay in the host's round.")}>Leave round</button>
        : <CancelRound key={view ?? "host"} startOpen={view === "cancel"} deleteText="Delete this round? Every score in it is erased for everyone in it, guests too. This can't be undone."
            onDelete={() => setSampleNote("Sample: the round and every score in it would be erased for everyone.")} />}
    </section>
    <GolfTripScoring solo stats={false} gps={false} holeRange={[0, 18]} par={PAR} courseName="Stevens Park Golf Course"
      initialHoles={strokes[0]} onCardChange={(card) => setStrokes((rows) => [card.strokes.slice(0, 18).map((s, h) => s ?? rows[0][h]), ...rows.slice(1)])}
      group={{ names: PLAYERS.slice(1).map((p) => p.name), strokes: strokes.slice(1), editable: [true, true, true], onChange: (rows) => setStrokes((all) => [all[0], ...rows]) }}
      gameSlot={(hole) => <div className={styles.game}>
        <HolePicks game={GAME} hole={hole} range={[0, 18]} names={PLAYERS.map((p) => p.name)} input={inputs[hole] ?? {}} onChange={(part) => setInputs((all) => { const next = [...all]; next[hole] = { ...next[hole], ...part }; return next; })} />
        <Standings result={result} compact />
      </div>}
      onSubmit={async () => ({ ok: false, message: "Sample round: nothing is saved." })} />
  </main>;
}
