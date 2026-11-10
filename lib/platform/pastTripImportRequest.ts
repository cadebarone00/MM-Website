import { MAX_IMPORT_BYTES, checkDraft, draftFromJson, readPastTripWorkbook, type DraftProblem, type ImportProblem, type ImportedTrip } from "./pastTripImport.ts";

/**
 * One Import past trip request, from either way in: the filled-in spreadsheet (a form with `file`) or the in-app
 * walkthrough (JSON with `draft`). Both carry `action` ("preview" or "create") and, to create, `me` (the player who is
 * you: their name for a spreadsheet, their key for a draft) and `requestId`. Shared by /api/golf-trips/import and the
 * app simulator's sample route. Everything is checked here, whatever the page already checked.
 */
export type ImportRequest =
  | { ok: true; action: "preview" | "create"; trip: ImportedTrip; me: string; requestId: string }
  | { ok: false; status: number; body: { ok: false; error: string; problems?: ImportProblem[]; draftProblems?: DraftProblem[] } };

const fail = (status: number, error: string): ImportRequest => ({ ok: false, status, body: { ok: false, error } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readImportRequest(request: Request, today = new Date().toISOString().slice(0, 10)): Promise<ImportRequest> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMPORT_BYTES + 64 * 1024) return fail(413, "The file is larger than 2 MB.");
  let action: unknown, me: unknown, requestId: unknown, trip: ImportedTrip;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await request.json().catch(() => null) as { action?: unknown; draft?: unknown; me?: unknown; requestId?: unknown } | null;
    const draft = draftFromJson(body?.draft);
    if (!body || !draft) return fail(400, "Invalid request.");
    ({ action, me, requestId } = body);
    const checked = checkDraft(draft, today);
    if (!checked.trip) return { ok: false, status: 422, body: { ok: false, error: "There are still things to fix.", draftProblems: checked.problems } };
    trip = checked.trip;
  } else {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) return fail(400, "Choose the filled-in template to upload.");
    if (file.size > MAX_IMPORT_BYTES) return fail(413, "The file is larger than 2 MB.");
    action = form.get("action"); me = form.get("me") ?? ""; requestId = form.get("requestId") ?? "";
    const read = readPastTripWorkbook(new Uint8Array(await file.arrayBuffer()), file.name, today);
    if (!read.ok) return fail(400, read.error);
    if (!read.trip) return { ok: false, status: 422, body: { ok: false, error: "Fix these in the spreadsheet, then upload it again.", problems: read.problems } };
    trip = read.trip;
  }
  if (action !== "preview" && action !== "create") return fail(400, "Invalid request.");
  const who = typeof me === "string" ? me : "";
  if (action === "create") {
    if (typeof requestId !== "string" || !UUID.test(requestId)) return fail(400, "Invalid request.");
    if (who && !trip.players.some((p) => p.id === who)) return fail(400, "Pick which player is you.");
  }
  return { ok: true, action, trip, me: who, requestId: typeof requestId === "string" ? requestId : "" };
}
