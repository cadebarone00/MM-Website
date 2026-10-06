/**
 * Live rounds (add-on decision 12): a trip round opens by itself on its scheduled day; the organizer can Start it early
 * or End it. Once the organizer has done either, that wins.
 */
export interface TripRoundState { state: "open" | "closed"; openedAt?: string; closedAt?: string }
export const tripRoundOpen = (entry: TripRoundState | undefined, scheduledToday: boolean) => entry ? entry.state === "open" : scheduledToday;
