import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Retired: this was the post-login Website / Portal / Scoring chooser. Old
 * links and bookmarks now go to Profile (signed out: Log In, which then lands
 * on Profile). Tournaments are entered from Tourneys → My Tournaments.
 */
export default async function ChooseAccountPage() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  redirect(user ? "/profile" : "/login");
}
