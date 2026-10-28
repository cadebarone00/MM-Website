import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CodeTournamentCreate } from "@/components/platform/CodeTournamentCreate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { skipSignInWall } from "@/lib/dev/signInWall";

export const metadata: Metadata = { title: "Create a Tournament | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Create a tournament joined by code (Tourneys → Create a Tournament → Tournament). Signed in only. */
export default async function NewCodeTournamentPage() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user && !skipSignInWall()) redirect("/login?next=/tournaments/code/new");
  return <CodeTournamentCreate />;
}
