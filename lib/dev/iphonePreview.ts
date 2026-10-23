/** Never enabled by a URL, cookie, public flag, or a production build. */
export function iphonePreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.DEV_IPHONE_PREVIEW === "true"
    && !env.VERCEL && !env.NETLIFY && !env.AWS_APP_ID && !env.CI;
}
export const IPHONE_PREVIEW_PATH = "/dev-iphone";
export const IPHONE_PREVIEW_HEADER = "x-maroon-iphone-preview";
export function isIphonePreviewPath(path: string): boolean {
  return path === IPHONE_PREVIEW_PATH || path.startsWith(IPHONE_PREVIEW_PATH + "/");
}
