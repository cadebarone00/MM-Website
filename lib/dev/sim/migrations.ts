import { MIGRATIONS } from "../../../scripts/fake-supabase.mjs";

/** Every file the test fake loads, plus the Play files the Scoring Simulator needs, in order. */
export const SIM_MIGRATIONS: string[] = [
  ...(MIGRATIONS as string[]),
  "shared_rounds.sql",
  "shared_round_scorekeeper.sql",
  "shared_round_delete.sql",
  "join_codes.sql",
  // The home page reads public.ribbon_content on every load; without it the log shows a red error on every page.
  "ribbon_content.sql",
];
