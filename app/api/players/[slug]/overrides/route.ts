import { NextResponse } from "next/server";
import { getProfileOverrides } from "@/lib/data/players/overrides";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const overrides = await getProfileOverrides(slug);
  return NextResponse.json({ ok: true, overrides }, { headers: { "Cache-Control": "no-store" } });
}
