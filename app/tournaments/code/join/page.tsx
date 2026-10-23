import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CodeTournamentJoin } from "@/components/platform/CodeTournamentJoin";
import { cleanCode } from "@/lib/platform/codeTournaments";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join a Tournament | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Join with a code (/tournaments/code/join?code=K7Q4MZ): what it opens, then Join. Signed in only (sign-in comes back here). */
export default async function JoinCodeTournamentPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = cleanCode((await searchParams).code ?? "");
  if (code.length !== 6) redirect("/tournaments/join");
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tournaments/code/join?code=${code}`)}`);
  return <CodeTournamentJoin code={code} />;
}
