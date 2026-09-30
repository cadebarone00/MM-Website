import { notFound } from "next/navigation";
import type { TournamentHome } from "./tournamentHome.ts";

/**
 * LOCAL DEV DEMO for the /play tournament app (routes under /dev/play).
 * A design-review tool only: it renders the real /play screens with the
 * fixture in playDemoFixture.ts. It never touches Supabase, auth or any
 * production loader, and it is a 404 unless BOTH are true:
 *   - NODE_ENV is "development" (never true for `next build` / `next start`)
 *   - DEV_PLAY_DEMO is exactly "true" (set it in your local .env)
 */
export const PLAY_DEMO_BASE = "/dev/play";

type Env = Record<string, string | undefined>;

export function isPlayDemoEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV === "development" && env.DEV_PLAY_DEMO === "true";
}

/** The demo data for a /dev/play screen, or notFound() when the demo is off. */
export async function loadPlayDemo(env: Env = process.env): Promise<TournamentHome> {
  if (!isPlayDemoEnabled(env)) notFound();
  // Loaded only after the check, so the fixture is never evaluated when the demo is off.
  const { buildPlayDemo } = await import("./playDemoFixture.ts");
  return buildPlayDemo();
}
