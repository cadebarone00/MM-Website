"use client";

import { useEffect, useState } from "react";
import { countdownParts, type CountdownTarget } from "@/lib/countdown";
import { useCountdownTarget } from "@/lib/hooks/useCountdownTarget";

export function RoundCountdown({ className = "", compact = false, target: providedTarget }: {
  className?: string;
  compact?: boolean;
  target?: CountdownTarget | null;
}) {
  const tournamentTarget = useCountdownTarget("tournament", providedTarget === undefined);
  const target = providedTarget === undefined ? tournamentTarget : providedTarget;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const parts = now === null ? null : countdownParts(target?.targetAt ?? null, now);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <div
      aria-label={target?.targetAt ? `Countdown to ${target.title}: ${target.targetAt}` : "Countdown time to be announced"}
      className={["shrink-0 font-condensed font-bold tabular-nums", compact ? "text-right text-3xs" : "text-xs sm:text-base", className].join(" ")}
    >
      {parts ? (
        <span>{parts.days}{compact ? "d" : " Days"} {pad(parts.hours)}:{pad(parts.minutes)}:{pad(parts.seconds)}</span>
      ) : <span>{target?.targetAt ? "Loading..." : "Time TBD"}</span>}
    </div>
  );
}
