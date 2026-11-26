/**
 * Where a tapped phone notification opens in the app (pure, unit-tested; project_specs.md "Expo app Step 6"). The
 * server's links are website paths from the notification master list (lib/notifications/catalog.ts); each maps to the
 * matching app screen, anything unknown opens Play.
 */
export type PushRoute =
  | { pathname: "/trips/[id]"; params: { id: string } }
  | { pathname: "/leagues/[id]"; params: { id: string } }
  | { pathname: "/profile/search"; params: { tab: "search" | "friends" } }
  | { pathname: "/golf-trips" | "/profile" | "/tourneys" | "/leagues" | "/" };

const ID = /^[A-Za-z0-9_-]{1,80}$/;

export function pushRoute(link: unknown): PushRoute {
  if (typeof link !== "string" || !link.startsWith("/") || link.startsWith("//")) return { pathname: "/" };
  const path = link.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "golf-trips") return parts[1] && ID.test(parts[1]) ? { pathname: "/trips/[id]", params: { id: parts[1] } } : { pathname: "/golf-trips" };
  if (parts[0] === "leagues") return parts[1] && ID.test(parts[1]) && parts[1] !== "join" && parts[1] !== "new" ? { pathname: "/leagues/[id]", params: { id: parts[1] } } : { pathname: "/leagues" };
  if (parts[0] === "profile") return parts[1] === "friends" || parts[1] === "search" ? { pathname: "/profile/search", params: { tab: "search" } } : { pathname: "/profile" };
  if (parts[0] === "tournaments" || parts[0] === "tourneys") return { pathname: "/tourneys" };
  return { pathname: "/" };
}
