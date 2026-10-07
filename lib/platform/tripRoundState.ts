/**
 * Live rounds (add-on decision 12): a trip round opens by itself on its scheduled day; the organizer can Start it early
 * or End it. Once the organizer has done either, that wins.
 */
export interface TripRoundState { state: "open" | "closed"; openedAt?: string; closedAt?: string }
export const tripRoundOpen = (entry: TripRoundState | undefined, scheduledToday: boolean) => entry ? entry.state === "open" : scheduledToday;

/** Organizer settings → Rounds: what a round's row says and what its button does next (a round open by itself shows End round). */
export function roundRow(entry: TripRoundState | undefined, scheduledToday: boolean): { label: string; next: "open" | "closed" } {
  if (tripRoundOpen(entry, scheduledToday)) return { label: "Open", next: "closed" };
  return entry ? { label: "Ended", next: "open" } : { label: "Opens on its day", next: "open" };
}
