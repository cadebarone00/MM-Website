"use client";

import { useEffect, useState } from "react";

const ROUND_ONE_START = new Date("2027-01-06T15:30:00Z");
const POLL_MS = 10000;

type HeaderStatus = {
  primary?: string;
  secondary?: string;
};

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getCountdownParts(now: Date) {
  if (now >= ROUND_ONE_START) {
    return { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  let months = 0;
  while (addMonths(now, months + 1) <= ROUND_ONE_START) {
    months += 1;
  }

  const monthAnchor = addMonths(now, months);
  const totalSeconds = Math.max(0, Math.floor((ROUND_ONE_START.getTime() - monthAnchor.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { months, days, hours, minutes, seconds };
}

export function RoundCountdown({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const [parts, setParts] = useState(() => getCountdownParts(new Date()));
  const [headerStatus, setHeaderStatus] = useState<HeaderStatus | null>(null);
  const pad = (value: number) => value.toString().padStart(2, "0");

  useEffect(() => {
    const tick = () => setParts(getCountdownParts(new Date()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/live-feed", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setHeaderStatus(data.headerStatus ?? null);
      } catch {
        if (!cancelled) setHeaderStatus(null);
      }
    }

    load();
    const interval = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const primary = headerStatus?.primary?.trim();
  const secondary = headerStatus?.secondary;
  if (primary) {
    if (compact) {
      return (
        <div
          aria-label={secondary ? `${primary}. ${secondary}` : primary}
          className={["max-w-[90px] truncate text-right font-condensed text-3xs font-bold uppercase tracking-wide text-gold-100", className].join(" ")}
        >
          {primary}
        </div>
      );
    }
    return (
      <div
        aria-label={secondary ? `${primary}. ${secondary}` : primary}
        className={[
          "max-w-[130px] truncate text-right font-condensed text-xs font-bold uppercase tracking-wide text-gold-100 sm:max-w-none sm:text-base",
          className,
        ].join(" ")}
      >
        <span>{primary}</span>
        {secondary && (
          <>
            <span className="mx-3 hidden h-4 w-px translate-y-[3px] bg-white/25 sm:inline-block" />
            <span className="hidden sm:inline">{secondary}</span>
          </>
        )}
      </div>
    );
  }

  const totalDays = parts.months * 30 + parts.days;

  if (compact) {
    return (
      <div
        aria-label="Countdown to Round 1 at 9:30 AM CST on January 6, 2027"
        className={["shrink-0 text-right font-condensed text-3xs font-bold tabular-nums text-white", className].join(" ")}
      >
        <span suppressHydrationWarning>
          {totalDays}d {pad(parts.hours)}:{pad(parts.minutes)}:{pad(parts.seconds)}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-label="Countdown to Round 1 at 9:30 AM CST on January 6, 2027"
      className={["shrink-0 text-right font-condensed font-bold tabular-nums text-white", className].join(" ")}
    >
      <span className="text-xs sm:hidden" suppressHydrationWarning>
        {totalDays}d {pad(parts.hours)}:{pad(parts.minutes)}:{pad(parts.seconds)}
      </span>
      <span className="hidden text-base sm:inline" suppressHydrationWarning>
        {parts.months} Months {parts.days} Days {pad(parts.hours)}:{pad(parts.minutes)}:{pad(parts.seconds)}
      </span>
    </div>
  );
}
