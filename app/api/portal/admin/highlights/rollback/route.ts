import { handleRollback } from "@/lib/highlights/adminApi";
import { highlightAdminDeps } from "@/lib/highlights/adminServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Make another published version live again. Platform admins only; the database re-checks. */
export async function POST(request: Request) {
  return handleRollback(request, highlightAdminDeps());
}
