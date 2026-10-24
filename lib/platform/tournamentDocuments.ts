import "server-only";
import { randomBytes } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { TOURNAMENT_DOCS_BUCKET, type TournamentDocKind } from "./codeTournaments.ts";

/**
 * Tournament PDFs (supabase/tournament_documents.sql): the Info PDF and Pin Sheet, uploaded by the organizer. The
 * organizer id always comes from the signed-in session. Never import this from a client component.
 */

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export type DocResult = { ok: true; path: string | null } | { ok: false; code: "not_installed" | "bad_file" | "refused" | "failed"; message: string };

const notInstalled: DocResult = { ok: false, code: "not_installed", message: "Tournament PDFs aren't set up yet (supabase/tournament_documents.sql)." };

async function point(organizer: string, id: string, kind: TournamentDocKind, path: string | null): Promise<{ ok: true; old: string | null } | { ok: false; result: DocResult }> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("set_code_tournament_document", { p_organizer: organizer, p_tournament: id, p_kind: kind, p_path: path });
  if (!error) return { ok: true, old: (data as string | null) ?? null };
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42703") return { ok: false, result: notInstalled };
  if (error.code === "42501" || error.code === "22023") return { ok: false, result: { ok: false, code: "refused", message: error.message } };
  console.error("set_code_tournament_document failed:", error.message);
  return { ok: false, result: { ok: false, code: "failed", message: "Couldn't save that. Try again." } };
}

/** Uploads a PDF (up to 10 MB) as the tournament's Info PDF or Pin Sheet, replacing (and deleting) the old one. */
export async function setTournamentDocument(organizer: string, id: string, kind: TournamentDocKind, file: File): Promise<DocResult> {
  if (file.type !== "application/pdf") return { ok: false, code: "bad_file", message: "Use a PDF file." };
  if (file.size > MAX_DOC_BYTES) return { ok: false, code: "bad_file", message: "That PDF is too big. Use one under 10 MB." };
  const db = createSupabaseServiceRoleClient();
  const path = `${id}/${kind === "info" ? "info" : "pin-sheet"}-${randomBytes(12).toString("hex")}.pdf`;
  const upload = await db.storage.from(TOURNAMENT_DOCS_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false, cacheControl: "31536000" });
  if (upload.error) {
    console.error("Tournament PDF upload failed:", upload.error.message);
    return /bucket/i.test(upload.error.message) ? notInstalled : { ok: false, code: "failed", message: "Couldn't upload that PDF. Try again." };
  }
  const saved = await point(organizer, id, kind, path);
  if (!saved.ok) { await db.storage.from(TOURNAMENT_DOCS_BUCKET).remove([path]); return saved.result; }
  if (saved.old) await db.storage.from(TOURNAMENT_DOCS_BUCKET).remove([saved.old]);
  return { ok: true, path };
}

/** Removes the tournament's Info PDF or Pin Sheet (its tab goes away). */
export async function removeTournamentDocument(organizer: string, id: string, kind: TournamentDocKind): Promise<DocResult> {
  const saved = await point(organizer, id, kind, null);
  if (!saved.ok) return saved.result;
  if (saved.old) await createSupabaseServiceRoleClient().storage.from(TOURNAMENT_DOCS_BUCKET).remove([saved.old]);
  return { ok: true, path: null };
}
