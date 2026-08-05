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

/** Set by the settlement flow (Tiger marks a market's winning selection) — see settle_mm_coin_market in supabase/schema.sql. */
export type WagerStatus = "pending" | "won" | "lost";

/** A single wager a signed-in account has placed, stored server-side in the mm_coin_bets table. */
export interface Wager {
  id: string;
  marketKey: string;
  selectionKey: string;
  placedAt: string;
  selectionLabel: string;
  odds: number;
  stake: number;
  potentialPayout: number;
  status: WagerStatus;
}
