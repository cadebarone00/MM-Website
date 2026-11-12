/**
 * The team draft (Team Competition → Team Selection → Draft) as Home's Momentum Draftboard shows it: when it is and how
 * long until then. Times are trip wall times ("YYYY-MM-DD" + "HH:mm"), like the rest of the trip.
 */
export type TeamDraft = {
  /** The team type (2 Teams, Pairs, 3-Ball, 4-Ball); null = no team competition. */
  teamType: string | null;
  selection: "Manual" | "Draft" | "Random" | null;
  date: string;
  time: string;
  /** Pick order; retained under type for compatibility with existing saved setup. */
  type: "Snake" | "Straight";
  method?: "Captain's Picks" | "Duck Race";
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 1 → "1st", 2 → "2nd", 11 → "11th", 21 → "21st". */
export function ordinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const last = day % 10;
  return `${day}${teen || last === 0 || last > 3 ? "th" : ["", "st", "nd", "rd"][last]}`;
}

/** "2027-05-21" + "21:15" → "Fri, May 21st @ 09:15 PM"; just the day when there's no time yet. */
export function draftWhenLabel(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const dayLabel = `${weekday}, ${MONTHS[month - 1]} ${ordinal(day)}`;
  if (!/^\d{2}:\d{2}$/.test(time)) return dayLabel;
  const [hours, minutes] = time.split(":").map(Number);
  return `${dayLabel} @ ${String(hours % 12 || 12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * Whether the Draftboard shows, and what it says. It shows for a team competition whose teams are picked by draft, until
 * the draft starts (`now` = trip wall time "YYYY-MM-DDTHH:mm[:ss]"). No date yet: it shows without a countdown.
 */
export function draftBoard(draft: TeamDraft | undefined, now: string | null): { when: string | null; target: string | null } | null {
  if (!draft?.teamType || draft.selection !== "Draft") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return { when: null, target: null };
  const target = `${draft.date}T${/^\d{2}:\d{2}$/.test(draft.time) ? draft.time : "00:00"}`;
  if (now && Date.parse(`${now}Z`) >= Date.parse(`${target}Z`)) return null;
  return { when: draftWhenLabel(draft.date, draft.time), target };
}

/** Players per team for a team type: Pairs 2, 3-Ball 3, 4-Ball 4; null = 2 Teams (no fixed size). */
export function teamDraftSize(teamType: string | null | undefined): number | null {
  return ({ Pairs: 2, "3-Ball": 3, "4-Ball": 4 } as Record<string, number>)[teamType ?? ""] ?? null;
}

/** How many teams the draft fills: players ÷ team size, rounded down (same rule as Settings); 2 for 2 Teams. */
export function teamDraftTeamCount(teamType: string | null | undefined, players: number): number {
  const size = teamDraftSize(teamType);
  return size ? Math.max(1, Math.floor(players / size)) : 2;
}

/** "Team A", "Team B", … "Team P" for team 0, 1, … 15. */
export const teamLetter = (team: number) => String.fromCharCode(65 + team);

/**
 * Whose pick it is (team index), or null when every team is full. `counts` = players on each team now; `start` = players
 * each team began with (its captain); `capacity` = team size (Infinity for 2 Teams). Picks go A → last team each round;
 * Snake turns around every other round, Straight doesn't. Full teams are skipped. Players already on a team count as picks.
 */
export function teamDraftTurn(order: "Snake" | "Straight", counts: number[], start: number[], capacity: number): number | null {
  const teams = counts.length;
  if (!teams || counts.every(count => count >= capacity)) return null;
  const teamAt = (step: number) => { const round = Math.floor(step / teams), place = step % teams; return order === "Snake" && round % 2 ? teams - 1 - place : place; };
  const made = Math.max(0, counts.reduce((sum, count) => sum + count, 0) - start.reduce((sum, count) => sum + count, 0));
  // Replay the picks made so far (skipping teams that would already be full), then find the next team with room.
  const replay = [...start];
  let step = 0;
  for (let done = 0; done < made && step < made * teams + teams * 2; step++) {
    const team = teamAt(step);
    if (replay[team] < capacity) { replay[team]++; done++; }
  }
  for (let look = 0; look < teams * 2; look++, step++) if (counts[teamAt(step)] < capacity) return teamAt(step);
  return counts.findIndex(count => count < capacity);
}
