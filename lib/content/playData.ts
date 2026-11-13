import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { contentViewer, inviterName, loadItems } from "./ribbonServer";
import { isRibbonSampleEnabled, sampleRibbonItems, SAMPLE_ADMIN_ID, SAMPLE_POSTER_ID } from "./ribbonSample";
import type { RibbonSetup } from "@/components/platform/ribbon/RibbonProvider";

/**
 * The Play page's data for whoever is signed in — shared by the website's Play page (app/page.tsx) and the app's
 * /api/app/play, so both show the same posts.
 */
export async function loadPlayData(): Promise<{ signedIn: boolean; ribbon: RibbonSetup | undefined }> {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  // DEV ONLY: sample ribbon posts, starting as an Admin (DEV_RIBBON_SAMPLE=true). Otherwise the saved posts.
  const ribbon = isRibbonSampleEnabled()
    ? { items: sampleRibbonItems(), role: "admin" as const, profileId: SAMPLE_ADMIN_ID, sample: true, sampleIds: { admin: SAMPLE_ADMIN_ID, poster: SAMPLE_POSTER_ID } }
    : await savedRibbon();
  return { signedIn: Boolean(user), ribbon };
}

/** The saved posts for this viewer. If the content tables can't be read (or aren't there yet), the page shows its built-in content. */
async function savedRibbon(): Promise<RibbonSetup | undefined> {
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
