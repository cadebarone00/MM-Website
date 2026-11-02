import { redirect } from "next/navigation";
import { PlatformHome } from "@/components/platform/PlatformHome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { skipSignInWall } from "@/lib/dev/signInWall";
import { contentViewer, inviterName, loadItems } from "@/lib/content/ribbonServer";
import { isRibbonSampleEnabled, sampleRibbonItems, SAMPLE_ADMIN_ID, SAMPLE_POSTER_ID } from "@/lib/content/ribbonSample";
export const metadata = { title: "The Maroon", description: "The digital home for competitive golf trips." };

export default async function Home() {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user && !skipSignInWall()) redirect("/new-user");
  // DEV ONLY: sample ribbon posts, starting as an Admin (DEV_RIBBON_SAMPLE=true). Otherwise the saved posts.
  const ribbon = isRibbonSampleEnabled()
    ? { items: sampleRibbonItems(), role: "admin" as const, profileId: SAMPLE_ADMIN_ID, sample: true, sampleIds: { admin: SAMPLE_ADMIN_ID, poster: SAMPLE_POSTER_ID } }
    : await savedRibbon();
  return <PlatformHome signedIn={Boolean(user)} ribbon={ribbon} />;
}

/** The saved posts for this viewer. If the content tables can't be read (or aren't there yet), the page shows its built-in content. */
async function savedRibbon() {
  try {
    const viewer = await contentViewer();
    const items = await loadItems(viewer);
    const invitedBy = viewer.role === "invited" && viewer.profileId ? await inviterName(viewer.profileId) : null;
    return { items, role: viewer.role, profileId: viewer.profileId, sample: false, invitedBy };
  } catch (error) {
    console.error("Play page: couldn't load ribbon content", error);
    return undefined;
  }
}
