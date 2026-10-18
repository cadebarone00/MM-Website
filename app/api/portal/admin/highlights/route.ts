import { handleState } from "@/lib/highlights/adminApi";
import { highlightAdminDeps } from "@/lib/highlights/adminServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live version, version history and pending drafts — platform admins only. */
export async function GET() {
  return handleState(highlightAdminDeps());
}
