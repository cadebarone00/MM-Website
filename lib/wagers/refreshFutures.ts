import { refreshLowIndividualOdds } from "./lowIndividualPricing";
import { refreshTeamWinnerOdds } from "./teamWinnerPricing";

/** Re-prices every tournament future after a match update. Each refresh logs
 * and swallows its own errors, so this never fails the caller's publication. */
export async function refreshFutures(seasonYear: number) {
  await Promise.all([refreshTeamWinnerOdds(seasonYear), refreshLowIndividualOdds(seasonYear)]);
}
