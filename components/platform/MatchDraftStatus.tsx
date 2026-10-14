"use client";
import { useSyncExternalStore } from "react";
import { useDevSetup } from "@/lib/dev/tripSetupStore";
import { readJustCreatedAll, useJustCreatedVersion } from "@/lib/dev/justCreatedStore";
import styles from "./GolfTripMatch.module.css";
import { useSavedTripSetup } from "./SavedTripSetupProvider";

const subscribe = (update: () => void) => { const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); };
type Choice = { method?: string; date?: string; time?: string };
export function MatchDraftStatus({ scope = "default", round }: { scope?: string; round: number }) {
  const saved = useDevSetup(scope);
  const real = useSavedTripSetup();
  const version = useJustCreatedVersion();
  const setup = real?.values ?? (scope === "empty" ? readJustCreatedAll(version) : saved);
  const now = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 1000), () => null);
  const counts = setup.roundsPerDay as Record<string, number> | undefined;
  let remaining = round - 1, day = 0;
  for (; day < 64; day++) { const count = counts?.[day] ?? 1; if (remaining < count) break; remaining -= count; }
  const own = (setup.matchSelections as Record<string, Choice> | undefined)?.[`${day}-${remaining}`];
  const choice = setup.matchPerRound ? own : setup.allRoundsMatch as Choice | undefined;
  const date = own?.date || choice?.date, time = own?.time || choice?.time;
  const target = choice?.method === "Match Draft" && date && time ? new Date(`${date}T${time}`).getTime() : NaN;
  const seconds = now === null ? null : Math.max(0, Math.ceil(target / 1000 - now));
  return <li className={styles.matchDraftStatus}>
    {Number.isFinite(target) ? <><strong>Match Draft</strong><span>{date} · {time}</span>
      <span role="timer">{seconds === null ? "—" : seconds === 0 ? "Draft time reached" : `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`}</span>
    </> : <><strong>No Match Draft has been set.</strong><span>Ask Your Organizer</span></>}
  </li>;
}
