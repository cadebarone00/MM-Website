import type { JoinPreview } from "./golfTripJoinLinks.ts";

/** What the "Join this trip" page shows for a link preview and whether someone is signed in. */
export type JoinPageState = "invalid" | "expired" | "signed-out" | "member" | "open";

export function joinPageState(preview: JoinPreview | null, signedIn: boolean): JoinPageState {
  if (!preview) return "invalid";
  if (preview.status === "expired") return "expired";
  if (!signedIn) return "signed-out";
  return preview.status === "member" ? "member" : "open";
}
