/**
 * The app build has one trip page (/golf-trips/trip/?id=…) instead of one per trip, because it's packaged as files.
 * Links the server sends back (e.g. "Add trip" → /golf-trips/<id>) and join / invite links still use the website's
 * shape; this turns them into the app's (one page each, with the value in the query). Anything else is returned as it is.
 */
const TRIP = /^\/golf-trips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/(?:settings\/delete|settings|flights))?\/?$/i;

/** Other website addresses with a value in the path, and the app page + query name that takes it instead. */
const WITH_VALUE: { pattern: RegExp; page: string; param: string }[] = [
  { pattern: /^\/golf-trips\/join\/([A-Za-z0-9_-]{24,64}|[A-HJKMNP-Z2-9]{6})\/?$/, page: "/golf-trips/join/", param: "code" },
  { pattern: /^\/golf-trips\/invite\/([A-Za-z0-9_-]{32,200})\/?$/, page: "/golf-trips/invite/", param: "token" },
  { pattern: /^\/tournaments\/code\/invite\/([A-Za-z0-9_-]{32,200})\/?$/, page: "/tournaments/code/invite/", param: "token" },
  { pattern: /^\/tournaments\/code\/((?!new$|join$|invite$)[A-Za-z0-9_-]{1,80})\/?$/, page: "/tournaments/code/", param: "id" },
  { pattern: /^\/tournaments\/live\/([A-Za-z0-9_-]{1,80})\/?$/, page: "/tournaments/live/", param: "id" },
  { pattern: /^\/tournaments\/invite\/([A-Za-z0-9_-]{32,200})\/?$/, page: "/tournaments/invite/", param: "token" },
  { pattern: /^\/watch\/([A-Za-z0-9]{1,12})\/?$/, page: "/watch/", param: "code" },
  { pattern: /^\/profile\/((?!search$|friends$|edit$|user$)[^/?#]{1,60})\/?$/, page: "/profile/user/", param: "username" },
  { pattern: /^\/t\/((?!site$)[^/?#]{1,80})\/?$/, page: "/t/site/", param: "tournament" },
  { pattern: /^\/leagues\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i, page: "/leagues/league/", param: "id" },
];

/** Tournament addresses with a slug and a year (and maybe a section): /play/<t>/<y>[/<section>], /t/<t>/<y>[/<section>],
 *  /tournaments/<t>/<y>[/next | /preview[/<section>]]. Words the app's other tournament pages use aren't slugs. */
const RESERVED = "code|live|invite|join|mine|new|create|request-access|studio|site|tournament";
const TOURNAMENT_PAGES: { pattern: RegExp; page: (section?: string) => string }[] = [
  { pattern: new RegExp(`^/play/((?!${RESERVED}$)[^/?#]{1,80})/(\\d{4})(?:/(leaderboard|matches|players|more))?/?$`), page: () => "/play/tournament/" },
  { pattern: new RegExp(`^/t/((?!${RESERVED}$)[^/?#]{1,80})/(\\d{4})(?:/([a-z-]{1,40}))?/?$`), page: () => "/t/site/" },
  { pattern: new RegExp(`^/tournaments/((?!${RESERVED}$)[^/?#]{1,80})/(\\d{4})/preview(?:/([a-z-]{1,40}))?/?$`), page: () => "/tournaments/studio/preview/" },
  { pattern: new RegExp(`^/tournaments/((?!${RESERVED}$)[^/?#]{1,80})/(\\d{4})/next/?$`), page: () => "/tournaments/studio/next/" },
  { pattern: new RegExp(`^/tournaments/((?!${RESERVED}$)[^/?#]{1,80})/(\\d{4})/?$`), page: () => "/tournaments/studio/" },
];

/** Website pages the app has under another address. */
const RENAMED: Record<string, string> = { "/forgot-password": "/start/forgot/" };

export function appPath(path: string): string {
  const url = new URL(path, "https://app.local");
  const renamed = RENAMED[url.pathname.replace(/(.)\/+$/, "$1")];
  if (renamed) return `${renamed}${url.search}`;
  const trip = TRIP.exec(url.pathname);
  if (trip) {
    url.searchParams.set("id", trip[1]);
    return `/golf-trips/trip${trip[2] ?? ""}/?${url.searchParams}`;
  }
  for (const { pattern, page } of TOURNAMENT_PAGES) {
    const match = pattern.exec(url.pathname);
    if (!match) continue;
    url.searchParams.set("tournament", decodeURIComponent(match[1]));
    url.searchParams.set("year", match[2]);
    if (match[3]) url.searchParams.set("section", match[3]);
    return `${page(match[3])}?${url.searchParams}`;
  }
  for (const { pattern, page, param } of WITH_VALUE) {
    const match = pattern.exec(url.pathname);
    if (!match) continue;
    url.searchParams.set(param, decodeURIComponent(match[1]));
    return `${page}?${url.searchParams}`;
  }
  return path;
}

/** A link the app can open: the app's own address in the app build, unchanged on the website. For code that navigates
 *  to a server-made or id link (router.push), where the app frame can't catch a tap. */
export function appHref(path: string): string {
  return process.env.NEXT_PUBLIC_MAROON_APP === "1" ? appPath(path) : path;
}
