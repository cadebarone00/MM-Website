import "server-only";
import { websitePlayerIdentity } from "./playerIdentity";
import { getCurrentProfile } from "@/lib/profile/currentProfile";

/** Server-owned identity; intentionally exclude auth IDs, email, tokens and legacy identifiers. */
export async function loadWebsitePlayer() {
  const current = await getCurrentProfile();
  return websitePlayerIdentity(current);
}
