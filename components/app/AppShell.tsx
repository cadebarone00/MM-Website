"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SiteChrome } from "@/components/nav/SiteChrome";
import { nextTournament, pastTournaments, latestCompleted, isPastLeaderboardSwitchover } from "@/lib/data";
import { installAppFetch } from "@/lib/app/appFetch";
import { appSupabase } from "@/lib/app/appAuth";
import { appPath } from "@/lib/app/appPaths";
import { shareOrigin } from "@/lib/app/shareOrigin";
import { AppComingSoon, keptOutOfApp } from "./AppComingSoon";
import { AppNative } from "./AppNative";
import { AppUpdate } from "./AppUpdate";
import styles from "./App.module.css";

// Before any screen loads: every fetch("/api/…") goes to the live server with the app's login (lib/app/appFetch.ts).
if (typeof window !== "undefined") installAppFetch();

/** The screens in the app. A link to any other page opens it on the website, in the phone's browser (Wagers and Fantasy
 *  aren't linked out; they show "Not in the app"). */
const IN_APP = ["/", "/login", "/golf-trips", "/golf-trips/import", "/golf-trips/trip", "/golf-trips/trip/settings", "/golf-trips/trip/settings/delete", "/golf-trips/trip/flights", "/onboarding", "/account/status", "/profile", "/profile/edit", "/settings",
  "/golf-trips/join", "/golf-trips/invite", "/rounds/new", "/tournaments/create",
  "/tournaments", "/tournaments/join", "/tournaments/mine", "/tournaments/new", "/tournaments/request-access", "/tournaments/code", "/tournaments/code/new",
  "/tournaments/code/join", "/tournaments/code/invite", "/tournaments/live", "/tournaments/invite", "/watch", "/pickems",
  "/profile/search", "/profile/friends", "/profile/user", "/settings/delete-account", "/settings/content-team", "/account/choose",
  "/play/tournament", "/t/site", "/tournaments/studio", "/tournaments/studio/next", "/tournaments/studio/preview", "/schedule", "/contact", "/watch-live", "/wagers", "/fantasy", "/dev/leagues",
  "/leagues", "/leagues/new", "/leagues/join", "/leagues/league", "/rounds/join"];
/** Cade's sign-up / log-in screens (/start, /start/*), his onboarding steps (/onboarding/*) and the account status screen. */
const inApp = (path: string) => IN_APP.includes(path) || ["/start", "/onboarding/", "/golf-trips/new", "/tournaments/create/"].some((prefix) => path.startsWith(prefix));
/** Screens a signed-out person may see (everything else sends them to Welcome). */
const signedOutOk = (path: string) => path === "/login" || path === "/account/status" || path === "/start" || path.startsWith("/start/")
  // The dev server's sample previews (e.g. /dev/leagues) need no account; a TestFlight build has none.
  || (process.env.NODE_ENV === "development" && path.startsWith("/dev/"));
/** The bottom menu's season data starts from the built-in season and refreshes itself from the server (SeasonCatalogProvider). */
const CATALOG = { nextTournament, pastTournaments, latestCompleted, scheduled: false, leaderboardOpen: isPastLeaderboardSwitchover() };

/**
 * The iPhone / Android app's frame (project_specs.md "The Maroon as a real iPhone app"): signed out → Cade's Welcome
 * screen (Sign up / Log in); a website-style trip link (e.g. from the server) → the app's trip page; a screen that isn't in the app yet →
 * "Coming to the app soon". Everything else is the website's own screens inside the website's own frame (SiteChrome).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = (usePathname() || "/").replace(/(.)\/+$/, "$1");
  const search = useSearchParams().toString();
  const [session, setSession] = useState<"checking" | "in" | "out">("checking");

  useEffect(() => {
    const auth = appSupabase().auth;
    void auth.getSession().then(({ data }) => setSession(data.session ? "in" : "out"));
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next ? "in" : "out"));
    return () => data.subscription.unsubscribe();
  }, []);

  // A tap on any in-app link with a website-style address (e.g. /tournaments/code/<id>, /golf-trips/<id>) opens the
  // app's page for it instead. Caught before the link's own handler, so the website's components need no changes.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const href = link?.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//") || link?.getAttribute("target") === "_blank") return;
      const mapped = appPath(href);
      const target = new URL(mapped, "https://app.local").pathname.replace(/(.)\/+$/, "$1");
      if (keptOutOfApp(target)) {
        event.preventDefault();
        router.push(`/${target.split("/")[1]}/`);
        return;
      }
      if (!inApp(target)) {
        event.preventDefault();
        window.open(`${shareOrigin()}${href}`, "_blank");
        return;
      }
      if (mapped === href) return;
      event.preventDefault();
      router.push(mapped);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  const asked = pathname + (search ? `?${search}` : "");
  const mapped = appPath(asked);
  const mustSignIn = session === "out" && !signedOutOk(pathname);
  useEffect(() => {
    if (mapped !== asked) router.replace(mapped);
    else if (mustSignIn) router.replace("/start/");
  }, [mapped, asked, mustSignIn, router]);

  if (session === "checking" || mustSignIn || mapped !== asked) return <main className={styles.splash} aria-busy="true"><span className={styles.logo}>The Maroon</span></main>;
  // SiteChrome hides the menus on the sign-up / log-in / onboarding screens itself, as on the website.
  return <AppUpdate><SiteChrome catalog={CATALOG}><AppNative />{inApp(pathname) ? children : <AppComingSoon path={pathname} />}</SiteChrome></AppUpdate>;
}
