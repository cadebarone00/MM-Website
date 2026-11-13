import { appApiBase, isAppBuild } from "./appEnv";

/**
 * Where a link people share (invites, join links, watch codes) should point. On the website: this site. In the
 * iPhone / Android app the page's own address is capacitor://localhost, which nobody else can open, so shared links
 * always use the live website instead.
 */
export function shareOrigin(): string {
  return isAppBuild ? new URL(appApiBase).origin : window.location.origin;
}
