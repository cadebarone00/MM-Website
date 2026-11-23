"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RoundCompleteSheet } from "@/components/platform/PlayRound";
import { moneyByHole, scoreGame, type GameConfig, type HoleInput } from "@/lib/platform/roundGames";
import { sideGameMoney } from "@/lib/platform/sideGames";
import styles from "@/components/platform/PlayRound.module.css";

/**
 * DEV ONLY (/dev/round-complete): the Round complete pop-up a scorekeeper sees after the last hole, on a made-up finished
 * round — 4 players, Skins at $5 a skin, greenies at $2. Nothing is saved: Save & exit only says so.
 */
const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const NAMES = ["You", "Cade", "Jake", "Uncle"];
// Each player's strokes over par, hole by hole (a believable card: a few birdies, some bogeys, the odd double).
const OVER = [
  [0, 1, 0, -1, 0, 1, 0, 0, 1, 0, -1, 0, 1, 0, 0, 1, 0, 0],
  [1, 0, 1, 0, -1, 0, 1, 1, 0, 0, 0, 1, 0, 2, 0, 0, -1, 1],
  [0, 0, -1, 0, 1, 1, 0, 0, 0, 1, 1, 0, -1, 0, 1, 0, 0, 0],
  [2, 1, 0, 1, 0, 0, 1, 0, 2, 1, 0, 1, 0, 0, 2, 1, 1, 0],
];
const STROKES = OVER.map((row) => row.map((over, h) => PAR[h] + over));
const GAME: GameConfig = { id: "skins", net: false, birdiesDouble: false, stake: 5 };
const COURSE = { par: PAR, rating: 70.2, slope: 126 };
const SIDE = { greenies: { value: 2 } };
// Greenies on the par 3s (holes 3, 7, 12, 16): Cade, carried, Jake, You.
const INPUTS: HoleInput[] = PAR.map(() => ({}));
INPUTS[2] = { greenie: 1 }; INPUTS[6] = { greenie: null }; INPUTS[11] = { greenie: 2 }; INPUTS[15] = { greenie: 0 };

export function DevRoundCompletePreview() {
  const [open, setOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const players = NAMES.map((name) => ({ name, handicap: null }));
  const result = scoreGame(GAME, players, COURSE, [0, 18], STROKES, INPUTS);
  const game = moneyByHole(GAME, players, COURSE, [0, 18], STROKES, INPUTS)!;
  const side = sideGameMoney(SIDE, NAMES.length, PAR, [0, 18], INPUTS)!;
  const holeMoney = game.map((row, p) => row.map((value, h) => (value ?? 0) + (side.byHole[p][h] ?? 0)));
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/dev/samples" className={styles.back} aria-label="Back to samples"><ArrowLeft size={18} aria-hidden="true" /></Link><p className={styles.kicker}>Round with friends · you keep score</p></header>
    <section className={styles.panel}>
      <h1 className={styles.title}>Eagle Pointe Golf Club</h1>
      <p className={styles.place}>Blue · 18 holes · Skins · sample round, nothing is saved</p>
      {note && <p className={styles.note} role="status">{note}</p>}
      {!open && <button type="button" className={styles.primary} onClick={() => { setOpen(true); setNote(null); }}>Show Round complete again</button>}
    </section>
    {open && <RoundCompleteSheet title="Eagle Pointe Golf Club · Skins"
      board={{ range: [0, 18], par: PAR, result, rows: NAMES.map((name, p) => ({ name, strokes: STROKES[p] })), holeMoney, extraMoney: side.total }}
      saving={false} error={null}
      onSave={() => { setOpen(false); setNote("Sample round: Save & exit would save everyone's rounds and go back to Play. Nothing was saved."); }}
      onClose={() => setOpen(false)} />}
  </main>;
}
