export type WebsitePlayer = { complete: boolean; displayName: string; username: string };
type IdentitySource = { status: "signed-out" | "no-profile" } | { status: "incomplete"; displayName: string | null } | { status: "ok"; profile: { displayName: string; username: string } };

/** Explicit safe projection at the server-to-presentation boundary. */
export function websitePlayerIdentity(current: IdentitySource): WebsitePlayer | null {
  if (current.status === "signed-out") return null;
  if (current.status !== "ok") return { complete: false, displayName: current.status === "incomplete" ? current.displayName ?? "" : "", username: "" };
  return { complete: true, displayName: current.profile.displayName, username: current.profile.username };
}
