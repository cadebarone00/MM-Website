"use client";

import { useState } from "react";
import { LeagueHome } from "@/components/platform/LeagueHome";
import { SAMPLE_LEAGUE_ME, sampleLeague } from "@/lib/dev/sampleLeague";
import styles from "@/components/platform/League.module.css";

/** Who the preview shows the league as: the organizer (who also keeps group 1's card), or a player in group 2. */
const VIEWS = [{ id: SAMPLE_LEAGUE_ME, name: "Organizer & scorer" }, { id: "p6", name: "Player" }] as const;

/** DEV ONLY: the real league screen on a sample league; nothing is saved. */
export function DevLeaguePreview() {
  const [view, setView] = useState<string>(SAMPLE_LEAGUE_ME);
  const [league] = useState(sampleLeague);
  return <>
    <div className={`${styles.toggle} ${styles.previewBar}`} role="radiogroup" aria-label="Preview as">
      {VIEWS.map((v) => <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)}>{v.name}</button>)}
    </div>
    {/* A new key per view starts each one fresh. */}
    <LeagueHome key={view} sample={{ league, meId: view }} />
  </>;
}
