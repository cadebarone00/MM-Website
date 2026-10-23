import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CodeTournamentHome } from "@/components/platform/CodeTournamentHome";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tournament | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** A tournament joined by code: leaderboard and scoring (members only; the page loads it through the API). */
export default async function CodeTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tournaments/code/${id}`)}`);
  return <CodeTournamentHome id={id} meId={user.id} />;
}
