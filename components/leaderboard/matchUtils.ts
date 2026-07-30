import type { RealMatch, Team, Tournament } from "@/lib/data/types";

export function matchStatus(match: RealMatch) {
  return match.status ?? "final";
}

export function matchLeader(match: RealMatch): Team | "tie" {
  if (match.leader) return match.leader;
  if (match.maroonPts > match.whitePts) return "maroon";
  if (match.whitePts > match.maroonPts) return "white";
  return "tie";
}

export function matchLabel(match: RealMatch): string {
  const leader = matchLeader(match);
  const status = matchStatus(match);
  const margin = match.margin ?? Math.abs(match.maroonPts - match.whitePts);
  const remaining = match.holesRemaining;

  if (status === "scheduled") return "VS";
  if (leader === "tie") return "AS";
  if (status === "final" && remaining != null && remaining > 0) return `${margin}&${remaining}`;
  return `${margin} Up`;
}

/** Which round (day) the Team view should default to: the day currently in progress, or the last day played if the tournament is complete. */
export function currentRoundDay(tournament: Tournament): number {
  const days = [...new Set(tournament.matches.map((m) => m.day))].sort((a, b) => a - b);
  if (days.length === 0) return 1;
  const activeDay = days.find((day) => tournament.matches.some((m) => m.day === day && matchStatus(m) !== "final"));
  return activeDay ?? days[days.length - 1];
}

export const LIVE_START_LABEL = "9:30 AM CST on January 6";

export function centralDateLabel(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).formatToParts(new Date());
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";

  return `${month} ${day}${suffix} ${year}`;
}
