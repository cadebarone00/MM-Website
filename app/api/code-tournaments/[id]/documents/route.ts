import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeTournamentDocument, setTournamentDocument, type DocResult } from "@/lib/platform/tournamentDocuments";
import type { TournamentDocKind } from "@/lib/platform/codeTournaments";

/** Tournament Settings → Info PDF / Pin Sheet (organizer only). POST form { kind, file } uploads; DELETE ?kind= removes. */
const kindOf = (value: unknown): TournamentDocKind | null => value === "info" || value === "pinSheet" ? value : null;
const reply = (result: DocResult) => result.ok ? NextResponse.json({ ok: true, path: result.path })
  : NextResponse.json({ ok: false, code: result.code, message: result.message }, { status: result.code === "bad_file" || result.code === "refused" ? 400 : result.code === "not_installed" ? 503 : 500 });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const kind = kindOf(form?.get("kind")), file = form?.get("file");
  if (!kind || !(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, code: "bad_file", message: "Pick a PDF first." }, { status: 400 });
  return reply(await setTournamentDocument(user.id, id, kind, file));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "signed_out" }, { status: 401 });
  const kind = kindOf(new URL(request.url).searchParams.get("kind"));
  if (!kind) return NextResponse.json({ ok: false, code: "bad_file", message: "That isn't a tournament document." }, { status: 400 });
  return reply(await removeTournamentDocument(user.id, id, kind));
}
