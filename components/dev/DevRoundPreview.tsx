"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GolfTripScoring } from "@/components/platform/GolfTripScoring";
import { CancelRound, HolePicks, Standings } from "@/components/platform/PlayRound";
import { InviteCodeCard } from "@/components/platform/InviteCodeCard";
import { scoreGame, type GameConfig, type HoleInput } from "@/lib/platform/roundGames";
import styles from "@/components/platform/PlayRound.module.css";

/**
 * DEV ONLY (/dev/round): a sample Play round with friends, using the real round pieces (the trip scorecard with the
 * group's scores, the game's per-hole picks and standings, the round's invite code). You're the host, 4 players, Skins
 * net, part way through. Nothing is saved; scores entered here only last until the page reloads.
 * ?view=cancel: the host's Cancel round choices open (Save & exit / Delete round). ?view=player: you're a player, so
 * you only get Leave round.
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
  const view = useSearchParams().get("view");
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
