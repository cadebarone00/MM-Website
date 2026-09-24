import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadIndividualInputs } from "./individualInputs";
import { publishLowIndividualOdds } from "./lowIndividualPricing";
import { refreshTeamWinnerOdds } from "./teamWinnerPricing";
import { publishTotalBirdiesOdds } from "./totalBirdiesPricing";

async function logged(label: string, work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    console.error(`${label} odds refresh failed:`, error);
  }
}

/** Individual-ball futures share one load of the field, scores, and Career Archive. */
async function refreshIndividualFutures(seasonYear: number) {
  const service = createSupabaseServiceRoleClient();
  await logged("Individual futures", async () => {
    const inputs = await loadIndividualInputs(service, seasonYear);
    await Promise.all([
      logged("Low Individual", () => publishLowIndividualOdds(service, inputs)),
      logged("Total Birdies", () => publishTotalBirdiesOdds(service, inputs)),
    ]);
  });
}

/** Re-prices every tournament future after a match update. Errors are logged
 * and swallowed, so this never fails the caller's publication. Hole in One
 * needs no refresh: it's computed on every read. */
export async function refreshFutures(seasonYear: number) {
  await Promise.all([refreshTeamWinnerOdds(seasonYear), refreshIndividualFutures(seasonYear)]);
}
