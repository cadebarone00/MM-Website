import { handleDraftUpload } from "@/lib/highlights/adminApi";
import { highlightAdminDeps } from "@/lib/highlights/adminServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Check (action=preview) or save (action=save) an uploaded .xlsx. Never publishes. Platform admins only; the database re-checks. */
export async function POST(request: Request) {
  return handleDraftUpload(request, highlightAdminDeps());
}
