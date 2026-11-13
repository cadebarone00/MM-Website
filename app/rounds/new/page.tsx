import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PlayRound } from "@/components/platform/PlayRound";
import { skipSignInWall } from "@/lib/dev/signInWall";

export const metadata = { title: "Play a round | The Maroon" };

/** Play a round: pick a course, answer a few questions, score it, save it to your rounds. `?round=<id>` opens a round with friends. Accounts only. */
export default async function PlayRoundPage({ searchParams }: { searchParams: Promise<{ round?: string | string[] }> }) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user && !skipSignInWall()) redirect("/login");
  const { round } = await searchParams;
  return <PlayRound openRound={typeof round === "string" ? round : undefined} />;
}
