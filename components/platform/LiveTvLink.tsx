"use client";

import { useState } from "react";
import { Tv } from "lucide-react";
import { tapInPath } from "@/lib/platform/tapIn";
import type { TvShow } from "@/lib/platform/liveTv";
import styles from "./CodeTournament.module.css";

const CHOICES: [TvShow, string][] = [["both", "Both"], ["individual", "Individual"], ["match", "Match play"]];

/**
 * The Maroon Live TV mode (project_specs.md, Step 4), organizers only: pick the board (individual, match play, or both
 * taking turns) and open the full-screen leaderboard on the TV's browser. The pick rides in the link (?show=), so
 * nothing is saved. An event without match play just shows its individual board.
 */
export function LiveTvLink({ code }: { code: string }) {
  const [show, setShow] = useState<TvShow>("both");
  const path = tapInPath(code);
  if (!path) return null;
  const href = `${path}/tv?show=${show}`;
  return <section className={`${styles.settingsPanel} ${styles.cutEditor}`} aria-label="TV mode">
    <p className={styles.cutBlurb}><b>TV mode</b>: a full-screen leaderboard that scrolls on its own. Open it on the TV&apos;s browser.</p>
    <div className={styles.cutChoices} role="group" aria-label="Which board TV mode shows">
      {CHOICES.map(([value, label]) => <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)}>{label}</button>)}
    </div>
    <a className={styles.settingsAction} href={href} target="_blank" rel="noopener noreferrer"><Tv size={16} aria-hidden="true" /> Open TV mode</a>
  </section>;
}
