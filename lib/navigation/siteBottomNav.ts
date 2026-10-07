/** Mobile-only floating bottom nav shown across the public site. */

export const SITE_BOTTOM_NAV_CONTENT_CLASS =
  "pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-0";

const ORGANIZER_TOURNAMENT =
  /^\/tournaments\/[^/]+\/\d+/;

/** Routes that use their own full-screen chrome (broadcast, play app, organizer studio, etc.). */
export function isSiteBottomNavHidden(pathname: string): boolean {
  if (pathname === "/dev/tournament/settings") return true;
  if (pathname === "/new-user" || pathname === "/login" || pathname.startsWith("/login/") || pathname === "/signup") return true;
  if (pathname.startsWith("/broadcast")) return true;
  if (pathname === "/portal/admin/scoring-preview/mobile") return true;
  if (pathname === "/t" || pathname.startsWith("/t/")) return true;
  if (pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/play/") || pathname === "/dev/play" || pathname.startsWith("/dev/play/")) return true;
  if (pathname === "/tournaments" || pathname === "/tournaments/new" || pathname === "/tournaments/request-access") return true;
  if (ORGANIZER_TOURNAMENT.test(pathname)) return true;
  return false;
}

export function siteBottomNavTabActive(pathname: string, href: string): boolean {
  // Tourneys stays lit on its My Tournaments list and the Create Tournament page too.
  if (href === "/tournaments/join") {
    return pathname === "/tournaments/join" || pathname.startsWith("/tournaments/join/") || pathname === "/tournaments/mine" || pathname === "/tournaments/create";
  }
  // Profile stays lit on the account screens (e.g. the post-login /account/choose).
  if (href === "/profile") {
    return pathname === "/profile" || pathname.startsWith("/profile/") || pathname.startsWith("/account");
  }
  // Play is the home page; it stays lit on The Maroon's category sub-pages too.
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/the-maroon/");
  }
  // Golf Trips stays lit across the trip flow, including the local dev preview used for the mobile mock.
  if (href === "/golf-trips") {
    return pathname === "/golf-trips" || pathname.startsWith("/golf-trips/") || pathname === "/dev/tournament" || pathname.startsWith("/dev/tournament/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
