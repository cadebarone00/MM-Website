"use client";

import { useMemo } from "react";
import { useSimulator } from "./SimulatorBridge";
import { CodeTournamentHome } from "@/components/platform/CodeTournamentHome";
import { CodeTournamentCreate } from "@/components/platform/CodeTournamentCreate";
import { CodeTournamentJoin } from "@/components/platform/CodeTournamentJoin";
import { SAMPLE_LOOKUP, sampleTourney } from "@/lib/dev/sampleTourney";

/** DEV ONLY: the real tournament screens on a sample tournament; the simulator's Tourneys conditions pick the view. */
export function DevTourneyPreview() {
  const preview = useSimulator()?.state.tourneyPreview ?? "player";
  const sample = useMemo(() => preview === "create" || preview === "join" ? null : sampleTourney(preview), [preview]);
  if (preview === "create") return <CodeTournamentCreate sample />;
  if (preview === "join") return <CodeTournamentJoin code="K7Q4MZ" sample={SAMPLE_LOOKUP} />;
  // A new key per view starts each one fresh (scores entered on one view don't carry to another).
  return sample && <CodeTournamentHome key={preview} id="sample" meId={sample.meId} sample={{ tournament: sample.tournament, spectator: sample.spectator }} />;
}
