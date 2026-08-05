/** A single player prop market for one match — e.g. "Cade Barone, Strokes (this match), line 71.5". */
export interface PropMarket {
  id: string;
  matchId: string;
  player: string;
  statLabel: string;
  line: number;
  overOdds: number;
  underOdds: number;
}

/** One row of the Tournament Winner futures ladder. */
export interface FutureLadderEntry {
  player: string;
  odds: number;
}

/** Maroon-vs-White two-way futures odds for who wins the tournament overall. */
export interface TeamFutureOdds {
  maroon: number;
  white: number;
}

/** Only "pending" exists in this phase — there's no settlement engine yet. */
export type WagerStatus = "pending";

/** A single wager a signed-in account has placed, stored in `lib/wagers/wallet.ts`. */
export interface Wager {
  id: string;
  placedAt: string;
  selectionLabel: string;
  odds: number;
  stake: number;
  potentialPayout: number;
  status: WagerStatus;
}
