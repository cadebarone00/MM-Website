import { NextResponse } from "next/server";

/** Kept only to make old clients fail safely after manual settlement removal. */
export async function GET() {
  return NextResponse.json({ ok: false, error: "Manual settlement history is no longer exposed here." }, { status: 410 });
}
