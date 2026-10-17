import Link from "next/link";
import { redirect } from "next/navigation";
import { HighlightsAdmin } from "@/components/portal/admin/HighlightsAdmin";
import { loadAdminState } from "@/lib/highlights/adminApi";
import { highlightAdminDeps } from "@/lib/highlights/adminServer";
import { requirePlatformAdmin } from "@/lib/portal/requirePlatformAdmin";

export const dynamic = "force-dynamic";

/** Highlights Admin — platform admins only (profiles.platform_role = 'admin'). */
export default async function HighlightsAdminPage() {
  const check = await requirePlatformAdmin();
  if (check.status === "signed-out") redirect("/login");
  if (check.status === "forbidden") redirect("/");
  const result = await loadAdminState(highlightAdminDeps());
  const problem = result.ok ? null : String(((await result.response.json()) as { error?: string }).error ?? "Couldn't load highlights.");

  return <main className="mx-auto max-w-[1100px] space-y-6 px-4 py-12 sm:px-7">
    <Link href="/portal/admin" className="text-sm underline">Back to Admin Center</Link>
    <h1 className="font-serif text-3xl font-bold text-ink-900">Highlights</h1>
    <p className="text-sm text-ink-600">The Google Sheet is the source of truth. Export it as .xlsx, check it here, save a draft, then publish. Wording changes and behavior changes are labeled; behavior changes need an extra confirmation.</p>
    {problem ? <p role="alert" className="rounded border border-amber-500 bg-amber-50 p-3 text-sm">{problem}</p> : result.ok && <HighlightsAdmin initial={result.state} />}
  </main>;
}
