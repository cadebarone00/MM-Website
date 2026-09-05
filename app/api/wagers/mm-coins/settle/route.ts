import { NextResponse } from "next/server";

/** Manual settlement is deliberately disabled. Official Match Close Out is
 * the only route allowed to settle a live-match MM Coin market. */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Manual settlement is retired. Close Out Match settles the official market automatically." }, { status: 405 });
}
