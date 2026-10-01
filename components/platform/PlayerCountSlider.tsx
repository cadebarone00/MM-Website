"use client";

import { useState } from "react";
import styles from "./CreateTournament.module.css";

/** Golf Trip questionnaire: how many players are going, picked with a slider. */
export function PlayerCountSlider({ min = 1, max = 24, initial = 4 }: { min?: number; max?: number; initial?: number }) {
  const [count, setCount] = useState(initial);

  return <label className={styles.slider}>
    <span className={styles.sliderHead}>
      <span className={styles.fieldLabel}>Number of Players</span>
      <span className={styles.sliderValue}>{count}</span>
    </span>
    <input className={styles.range} type="range" name="playerCount" min={min} max={max} step={1}
      value={count} onChange={(event) => setCount(Number(event.target.value))} />
  </label>;
}
