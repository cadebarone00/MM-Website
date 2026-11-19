import { priceTrip, type Market, type TripSetup } from "./predictBets";

/**
 * The one way Predict's odds are worked out: 4,000 simulated trips with a fixed seed, so the Predict tab and the leaderboard's
 * win-odds line always show the same numbers. Used by the background worker (predictMarkets.worker.ts) and as its fallback.
 */
export const PREDICT_SIMS = 4000;
export const PREDICT_SEED = 7;
export const runPredict = (setup: TripSetup): Market[] => priceTrip(setup, PREDICT_SIMS, PREDICT_SEED);
