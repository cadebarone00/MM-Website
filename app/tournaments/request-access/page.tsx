import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadMyAccess } from "@/lib/platform/accessRequestsServer";
import { RequestAccessView } from "@/components/platform/TourneyAccessViews";

export const metadata: Metadata = { title: "Request access | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Beta creator access: request it, or see where your request stands. Signed-in only. */
export default async function RequestAccessPage() {
  const result = await loadMyAccess();
  if (!result.signedIn) redirect("/login");
  return <RequestAccessView result={result} />;
}
