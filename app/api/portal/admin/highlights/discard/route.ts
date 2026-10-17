import { handleDiscard } from "@/lib/highlights/adminApi";
import { highlightAdminDeps } from "@/lib/highlights/adminServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Discard a pending draft. Platform admins only; the database re-checks. */
export async function POST(request: Request) {
  return handleDiscard(request, highlightAdminDeps());
}
