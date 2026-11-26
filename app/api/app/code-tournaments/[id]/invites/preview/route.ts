import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCodeTournament } from "@/lib/platform/codeTournamentsServer";
import { parseTournamentInviteSpreadsheet } from "@/lib/platform/inviteSpreadsheet";

/** Preview a locally selected spreadsheet; no invitations are created or sent. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient(request)).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const tournament = await getCodeTournament(user.id, id);
  if (!tournament.ok || !tournament.value || tournament.value.organizer !== user.id) return NextResponse.json({ ok: false, code: "refused", message: "Only the organizer can import players." }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024 + 65536) return NextResponse.json({ ok: false, message: "Choose a CSV or Excel file under 5 MB." }, { status: 413 });
  const form = await request.formData().catch(() => null); const file = form?.get("file");
  if (!(file instanceof File) || !/\.(csv|xlsx|xls)$/i.test(file.name) || file.size === 0 || file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, message: "Choose a CSV or Excel file under 5 MB." }, { status: 400 });
  try {
    const rows = parseTournamentInviteSpreadsheet(new Uint8Array(await file.arrayBuffer()), tournament.value.scoring === "Net");
    return NextResponse.json({ ok: true, ...rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, message: "Could not read that file. Choose a CSV or Excel file with player columns." }, { status: 400 });
  }
}
