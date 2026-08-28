// app/api/portal/profile/route.ts
import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { callPythonApi } from "@/lib/scorekeeper/pythonClient";

interface WhoamiResponse {
  ok: boolean;
  error?: string;
  playerFirst?: string;
  displayName?: string;
  team?: string | null;
  email?: string;
  phone?: string;
  logoutAfterMinutes?: number;
  pendingEdits?: { id: number; submittedFields: Record<string, string> }[];
  profile?: Record<string, string>;
}

export async function GET() {
  const player = await requirePlayer();
  if (!player) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
  }

  try {
    const result = await callPythonApi<WhoamiResponse>("/player-whoami", { player: player.playerFirstName });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[portal/profile] python call failed", err);
    return NextResponse.json({ ok: false, error: "Could not reach the scoring system." }, { status: 502 });
  }
}
