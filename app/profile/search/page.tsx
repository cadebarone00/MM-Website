import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FindGolfers } from "@/components/profile/FindGolfers";
import { loadFindGolfers } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Find Golfers | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Profile → magnifying glass: search golfers and ask to be friends; requests waiting on me show too. Signed-in profiles only. */

export default async function FindGolfersPage() {
  const data = await loadFindGolfers();
  if (data.status !== "ok") redirect("/login");
  return <FindGolfers incoming={data.incoming} setupMessage={data.setupMessage} />;
}
