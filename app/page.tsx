import { redirect } from "next/navigation";
import { PlatformHome } from "@/components/platform/PlatformHome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { skipSignInWall } from "@/lib/dev/signInWall";
import { isRibbonSampleEnabled, sampleRibbonItems, SAMPLE_ADMIN_ID, SAMPLE_POSTER_ID } from "@/lib/content/ribbonSample";
export const metadata = { title: "The Maroon", description: "The digital home for competitive golf trips." };

export default async function Home() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user && !skipSignInWall()) redirect("/new-user");
  // DEV ONLY until the content tables exist: sample ribbon posts, starting as an Admin (DEV_RIBBON_SAMPLE=true).
  const ribbon = isRibbonSampleEnabled()
    ? { items: sampleRibbonItems(), role: "admin" as const, profileId: SAMPLE_ADMIN_ID, sample: true, sampleIds: { admin: SAMPLE_ADMIN_ID, poster: SAMPLE_POSTER_ID } }
    : undefined;
  return <PlatformHome signedIn={Boolean(user)} ribbon={ribbon} />;
}
