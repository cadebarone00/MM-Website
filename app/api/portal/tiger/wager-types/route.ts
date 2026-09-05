import { NextResponse } from "next/server";

/** Custom wager types are intentionally disabled. Public types must be
 * code-defined so their model, readiness checks, and settlement rules stay
 * aligned with the public Wagers experience. */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Custom wager types are not supported. Add the modeled wager to the coded public catalogue first." }, { status: 405 });
}
