/** "+150" for a positive line, "-200" (already has its sign) for a negative one. */
export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

/** Standard American-odds payout: total returned (stake + profit) if the bet wins. */
export function potentialPayout(stake: number, odds: number): number {
  const profit = odds > 0 ? stake * (odds / 100) : stake * (100 / Math.abs(odds));
  return Math.round((stake + profit) * 100) / 100;
}
