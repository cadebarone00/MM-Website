import { getCombinedCareerArchive } from "@/lib/data/combinedCareerArchive";
import { isTestSeason } from "@/lib/live/testSeason";
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

/**
 * Re-prices every tournament future from the latest Career Archive, which
 * includes every confirmed live hole and submitted handicap round. The
 * archive is loaded once and shared. Errors are logged and swallowed, so
 * this never fails the caller. Hole in One needs no refresh: it's computed
 * on every read.
 *
 * `teamWinnerPricingBudgetMs` lets Team Winner also re-price matchups whose
 * players' data changed. Pass it only from background work (after()), never
 * from a request someone is waiting on.
 */
export async function refreshFutures(seasonYear: number, { teamWinnerPricingBudgetMs = 0 }: { teamWinnerPricingBudgetMs?: number } = {}) {
  let archive: Awaited<ReturnType<typeof getCombinedCareerArchive>>;
  try {
    archive = await getCombinedCareerArchive({ includeTestSeason: isTestSeason(seasonYear) });
  } catch (error) {
    console.error("Futures refresh couldn't load the Career Archive:", error);
    return;
  }
  const service = createSupabaseServiceRoleClient();
  await Promise.all([
    refreshTeamWinnerOdds(seasonYear, { pricingBudgetMs: teamWinnerPricingBudgetMs, archive }),
    logged("Individual futures", async () => {
      const inputs = await loadIndividualInputs(service, seasonYear, archive);
      await Promise.all([
        logged("Low Individual", () => publishLowIndividualOdds(service, inputs)),
        logged("Total Birdies", () => publishTotalBirdiesOdds(service, inputs)),
      ]);
    }),
  ]);
}
