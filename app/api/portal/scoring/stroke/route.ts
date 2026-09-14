import { NextResponse } from "next/server";

/** Individual autosave writes cannot bypass complete-hole validation and agreement. */
export async function POST() {
  return NextResponse.json({ ok: false, error: "Refresh the scoring page and use Submit Score to save the complete hole." }, { status: 409 });
}
