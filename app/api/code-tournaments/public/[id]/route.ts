import { NextResponse } from "next/server";
import { getPublicCodeTournament } from "@/lib/platform/codeTournamentsServer";
import { reply } from "@/lib/platform/codeTournamentsRequest";
import { spectatorTournament } from "@/lib/platform/watchView";

/** GET: a public tournament for anyone (read only, no sign-in), stripped like a watch code's: no ids, join code or organizer. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, code: "missing" }, { status: 404 });
  const result = await getPublicCodeTournament(id);
  if (result.ok && !result.value) return NextResponse.json({ ok: false, code: "missing" }, { status: 404 });
  return reply(result, (tournament) => ({ tournament: { ...spectatorTournament(tournament!), id } }));
}
