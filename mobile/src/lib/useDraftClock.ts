import { useEffect, useState } from "react";
import { countdownParts } from "@/lib/platform/momNotifications";

const pad = (n: number) => String(n).padStart(2, "0");
/** This phone's local time as "YYYY-MM-DDTHH:mm:ss" (the draft time is a local wall time, like the website). */
export const localStamp = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/**
 * A draft room's countdown, ticking every second (website TripMomentum DraftStrip): null = no time set; all zeros once the
 * start time has passed (so the room can say "Waiting To Start"). `target` = "YYYY-MM-DDTHH:mm" from the trip's settings.
 */
export function useDraftClock(target: string | null) {
  const [now, setNow] = useState(localStamp);
  useEffect(() => { const id = setInterval(() => setNow(localStamp()), 1000); return () => clearInterval(id); }, []);
  if (!target) return { parts: null, reached: false };
  const reached = now >= (target.length === 16 ? `${target}:00` : target);
  return { parts: reached ? { days: 0, hours: 0, minutes: 0, seconds: 0 } : countdownParts(target, now), reached };
}

export const clockText = (parts: { days: number; hours: number; minutes: number; seconds: number } | null) =>
  parts ? `${parts.days ? `${parts.days}d ` : ""}${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}` : "--:--";
