"use client";
import { useSyncExternalStore } from "react";
import { useDevSetup } from "@/lib/dev/tripSetupStore";
import { readJustCreatedAll, useJustCreatedVersion } from "@/lib/dev/justCreatedStore";
import { matchDraftCountdown, matchDraftStatus } from "@/lib/platform/matchDraftStatus";
import styles from "./GolfTripMatch.module.css";
import { useSavedTripSetup } from "./SavedTripSetupProvider";

const subscribe = (update: () => void) => { const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); };
export function MatchDraftStatus({ scope = "default", round }: { scope?: string; round: number }) {
  const saved = useDevSetup(scope);
  const real = useSavedTripSetup();
  const version = useJustCreatedVersion();
  const setup = real?.values ?? (scope === "empty" ? readJustCreatedAll(version) : saved);
  const now = useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 1000), () => null);
  // The round's Match Draft rule is shared with the Expo app (lib/platform/matchDraftStatus.ts).
  const draft = matchDraftStatus(setup as Record<string, unknown>, round);
  return <li className={styles.matchDraftStatus}>
    {draft ? <><strong>Match Draft</strong><span>{draft.date} · {draft.time}</span>
      <span role="timer">{now === null ? "—" : matchDraftCountdown(draft.target, now * 1000)}</span>
    </> : <><strong>No Match Draft has been set.</strong><span>Ask Your Organizer</span></>}
  </li>;
}
