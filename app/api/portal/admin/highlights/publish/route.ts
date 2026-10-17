import { handlePublish } from "@/lib/highlights/adminApi";
import { highlightAdminDeps } from "@/lib/highlights/adminServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Publish one pending draft as a new immutable version. Platform admins only; the database re-checks. */
export async function POST(request: Request) {
  return handlePublish(request, highlightAdminDeps());
}
