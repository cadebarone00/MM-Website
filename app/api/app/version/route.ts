import { NextResponse } from "next/server";

/**
 * The oldest app build that still works with the server (MAROON_APP_MIN_BUILD, a whole number; unset = every build).
 * An older app shows "Update The Maroon" instead of its screens (components/app/AppUpdate.tsx).
 */
export function GET() {
  const minimum = Number.parseInt(process.env.MAROON_APP_MIN_BUILD ?? "", 10);
  return NextResponse.json({ ok: true, data: { minimum: Number.isFinite(minimum) && minimum > 0 ? minimum : 0 } }, { headers: { "Cache-Control": "no-store" } });
}
