"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { MaroonMark } from "./MaroonMark";

const subscribe = (callback: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const snapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Full viewport inside the existing simulator; all controls stay outside the phone. */
export function BrandIntro() {
  const config = useSimulator();
  const systemReduced = useSyncExternalStore(subscribe, snapshot, () => true);
  const state = config?.state;
  const style = state?.brandStyle ?? "gold";
  const stage = state?.brandStage ?? "drawing";
  const duration = state?.brandDuration ?? 1200;
  const reduced = systemReduced || stage === "reduced";
  return <IntroPlayback key={`${style}:${stage}:${duration}:${state?.brandReplay ?? 0}:${reduced}`} gold={style === "gold"} duration={duration} still={reduced || stage === "finished"} />;
}

function IntroPlayback({ gold, duration, still }: { gold: boolean; duration: number; still: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const total = duration + (gold ? 450 : 0);
  useEffect(() => {
    if (still) return;
    let frame = 0;
    let start: number | undefined;
    function tick(now: number) {
      start ??= now;
      const next = Math.min(total, now - start);
      setElapsed(next);
      if (next < total) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still, total]);
  return <main aria-label="The Maroon app entrance" style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#500F23" }}>
    {/* Fills the whole screen so the app's top-clearance padding can't push the M off centre. */}
    <div style={{ position: "absolute", inset: 0 }}>
      <MaroonMark variant="intro" color="white" progress={still ? 1 : Math.min(1, elapsed / duration)} shimmer={gold && !still ? elapsed / total : undefined} />
    </div>
  </main>;
}
